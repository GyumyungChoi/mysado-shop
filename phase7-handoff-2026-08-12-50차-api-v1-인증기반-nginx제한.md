# Phase 7 — 50차 핸드오프

**일자** 2026-08-12
**주제** `/api/v1` API Key 인증 · 공통 응답 봉투 · rate limit · Nginx tailnet 제한
**커밋** `cbb7123`(docs) → `d17f322`(schema) → `5332fd9`(feat)
**배포** prod `5332fd9` 반영 완료 (pm2 ↺ 37) — **dev·prod 일치**
**마이그레이션** 1건 (`20260812124500_add_api_client`, additive)

---

## 0. 세션 시작 프로토콜 (다음 세션은 여기서 시작)

```bash
pm2 ls                                                    # online, ↺ 37
curl -so /dev/null -w "%{http_code}\n" localhost:3000     # 200
ss -tlnp | grep ':3001' || echo '3001 없음'
cd ~/apps/mysado-shop      && git log --oneline -1         # 5332fd9 (+ 이 문서 커밋 시 그 해시)
cd ~/apps/mysado-shop-prod && git log --oneline -1         # 5332fd9
```

DB 상태 확인(psql 단독 실행):

```sql
-- api_client 1행, product 228행 무변동
SELECT name, key_prefix, scopes, is_active FROM api_client;
SELECT count(*) FROM product;
```

> `last_used_at` 조회 시 `now()` 와 직접 빼지 말 것 — 컬럼이 `timestamp without time zone`(UTC 저장)이라
> KST 세션의 `now()` 와 빼면 9시간이 남습니다. `now() AT TIME ZONE 'UTC' - last_used_at` 을 쓰거나
> 값만 읽고 UTC로 해석합니다. **50차에 실제로 겪었습니다(§6-3).**

---

## 1. 이번 세션의 성격 — 34차 §5-10의 1단계

34차 v2가 설계한 12단계 중 **1단계(인증·권한 스코프·공통 응답 구조 + Nginx 제한)** 를 구현했습니다.
49차 §10-A가 ③⑤(인증 + orders 읽기)를 한 세션으로 봤으나, **③만 하고 ⑤는 51차로 분리**했습니다.

분리 근거 셋:
- 이 세션에 이미 마이그레이션 + Nginx + 키 발급 + E2E가 들어 있어 원칙 2(마이그레이션/기능 세션 분리)에 걸침
- 49차 §7-2의 대기 커밋이 이번 배포에 함께 넘어가 빌드 관찰 부담이 평소보다 큼
- 토스 심사가 4일 남아 8-3 묶음이 언제든 최우선으로 끼어들 수 있음

대신 **`GET /api/v1/ping`** 을 최소 소비자로 함께 만들어, 주문 API 없이도 ③ 전체를 실증했습니다.

---

## 2. 착수 전 실측이 바꾼 것 (43차 §8-⑴ 재적용)

| # | 34차 설계문 전제 | 50차 실측 | 조치 |
|---|---|---|---|
| ⑴ | `middleware.ts` 가 `/api/v1` 을 삼킬 것 | matcher가 **경로 6개 명시 열거** — `/api/v1` 미통과 | **무수정.** matcher에 추가 금지를 지시서에 명기 |
| ⑵ | `{ success, data }` 봉투가 이미 있을 것 | `lib/api-helpers.ts` 는 `{ message }` 단일 키. `{success}` 는 **어디에도 없음** | `/api/v1` 전용 봉투 신설, 기존 9개 라우트 무수정 |
| ⑶ | `--create-only` 로 SQL 검사 | 49차에 이미 불가 확정 | `migrate diff --script` 경로 사용 |
| ⑷ | Nginx 설정 grep 0건 | **심볼릭 링크라 `grep -r` 이 안 따라감** | `readlink -f` 로 실파일 지정 |

⑵가 가장 중요한 정정입니다. "기존 봉투 재사용"이라는 제 초기 전제가 틀렸고, 그렇다고 기존 라우트를
개조하면 **결제 3경로를 건드리게** 됩니다(43차 재고 차감 불변식이 그 파일들에 있음).

**결론: 봉투는 두 종류로 공존하며, 그것이 부채가 아니라 경계입니다.**

```
내부 라우트(브라우저 소비)   { message }              현행 유지, 무수정
/api/v1 (허브 소비)          { success, data|error }  신설 (34차 §5-8)
```

⑷는 44·45·46·47·49차에 이어 **0건 함정의 6연속 실증**입니다. 이번엔 패턴 오류가 아니라
**도구 특성**(심볼릭 링크)이 원인이었습니다. 0건의 원인 목록에 한 종류가 추가됐습니다.

---

## 3. 확정된 설계

### 3-1. 스키마 — `ApiClient` 1개만

```prisma
model ApiClient {
  id, name
  keyHash    @unique @map("key_hash")    // SHA-256 hex 64자, 조회 키
  keyPrefix  @map("key_prefix")          // 평문 앞 12자, 감사·식별 전용
  scopes     String[] @default([])
  isActive   @default(true)              // 일시 정지(되돌림 가능)
  lastUsedAt DateTime?
  createdAt, revokedAt                   // 영구 폐기 시각
}
```

- **`ApiRequest`(멱등성 테이블)는 만들지 않았습니다.** 소비자가 쓰기 API(52차)이므로
  지금 만들면 소비자 없는 테이블이 방치됩니다. 원칙 1(트리거 도래 시에만 additive).
- `keyHash` `@unique` 는 중복 방지가 아니라 **조회 인덱스**가 목적. 매 요청 단건 조회.
- **`keyPrefix` 로 조회하지 않습니다** — 조회는 `keyHash` 로만.
- 폐기는 행 삭제가 아니라 `isActive=false` / `revokedAt` 기록 (감사 흔적 보존).
- `.env.local` **무수정** — pepper를 도입하지 않았습니다. 고엔트로피 난수라 이득이 없고,
  dev·prod 양쪽 `.env.local` 동기화 결합만 생깁니다. `NEXT_PUBLIC_*` 재빌드 이슈도 없음.

### 3-2. 🔴 클래스를 만들지 않는다 (ES5 제약)

`tsconfig.json` 에 **`target` 이 없어 ES5로 컴파일**됩니다(43차 기록 재확인, `extends` 없는 자족 파일).

43차는 `StockShortageError` 에서 `Object.setPrototypeOf` 로 메웠으나, 이번엔 **애초에 클래스를
만들지 않는 구조**로 갔습니다. 실패는 판별 유니온 반환값으로 표현합니다.

```ts
type ApiAuthResult =
  | { ok: true; client: ApiAuthClient }
  | { ok: false; code: "UNAUTHORIZED" | "FORBIDDEN"; logReason: string };
```

`admin-guard.ts` 의 "미통과 시 null 반환, 호출측이 응답" 관례와 같은 결입니다.

> **🔴 신규 발견 — ES5 제약은 이터레이션에도 걸립니다.**
> `for (const [k,v] of map)` 은 `downlevelIteration` 없이 **TS2802로 실패**합니다.
> Claude Code가 `Map.forEach` + 배열 수집으로 우회했고, 이 사실이 지시서에 없던 것입니다.
> 43차는 클래스만 짚었으나 제약 범위가 더 넓습니다.

### 3-3. 인증 실패는 구분하지 않는다 (응답만)

세 사유(`missing_bearer` / `unknown_key` / `revoked`) 전부 **401 + 동일 본문**.
구분해 응답하면 공격자에게 "이 키는 존재한다"를 알려줍니다.

**단, 서버 로그에는 사유를 구분해 남깁니다** — 운영자는 구분이 필요합니다.

> 이 설계가 **첫 실전에서 값을 했습니다**(§6-2). prod 401의 원인을 1분 만에 갈랐습니다.

### 3-4. rate limit — 인메모리 60/분

pm2가 **fork 모드 단일 프로세스**로 실측 확인되어 인메모리 Map으로 충분합니다(클러스터였다면 불가).
고정 윈도. `Map.size > 1000` 일 때만 만료 항목 청소(무한 증가 경로 차단).

### 3-5. `lastUsedAt` — 5분 스로틀 + fire-and-forget

매 요청 UPDATE는 하지 않습니다. 인증 경로(읽기)가 쓰기 경로가 되면 안 되고,
10분 주기 호출에 매번 쓰기는 이득 없는 부하입니다. `await` 없이 던지고 `.catch(()=>{})`.

---

## 4. Nginx — tailnet 한정

```nginx
location /api/v1 {
    allow 100.64.0.0/10;   # Tailscale CGNAT
    allow 127.0.0.1;
    deny  all;
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Host / X-Real-IP / X-Forwarded-For / X-Forwarded-Proto
}
```

- `location` 블록은 형제로부터 `proxy_set_header` 를 **상속하지 않으므로** 4줄을 복제했습니다.
  누락하면 Host가 깨져 Next.js 라우팅이 어긋납니다.
- `Upgrade`/`Connection` 은 제외 — API에 websocket 없음.
- `client_max_body_size 50M` 은 server 레벨이라 상속됨(52차 bulk에 충분).
- **한계**: 이 allow는 nginx 경유 트래픽에만 적용됩니다. `100.121.175.2:3000` 직접 접근은
  우회하지만, KT 라우터가 80·443만 포워딩하므로 공개 인터넷 노출은 아닙니다.

### 4-1. 편집 경로 — nano 실패 → 스크립트

nano 편집이 저장되지 않아(파일 크기·mtime 무변동으로 확인) **python3 exact-match + count==1 가드**로
전환했습니다. 프로젝트 파일 편집 방식과 동일하며, 손 붙여넣기의 들여쓰기 사고도 없습니다.

- 한글은 `\uXXXX` 이스케이프 — 붙여넣기 인코딩 변형 차단
- 힙독을 `'PYEOF'` 로 인용 — `$host`·`$remote_addr` 셸 확장 차단 (실측으로 온전함 확인)
- 앵커는 주석 + `location / {` 2줄 조합(단독 주석은 유일성이 약함)
- 백업 `mysado.bak-50차` 선행

### 4-2. 🟡 붙여넣기 아티팩트 주의

`sudo cat` 출력에서 `server_name www.mysado.net;` 이 마크다운 링크 형태로 두 번 나타났습니다.
**실제 파일은 정상입니다**(그랬다면 nginx 문법 오류로 서비스가 죽었을 것). 터미널→붙여넣기 과정의
자동 링크화이며, **이 줄을 "고치려 하지 마십시오".** 멀쩡한 설정을 수정하는 것이 유일한 위험입니다.

---

## 5. 허브(시놀로지 NAS) 접속 경로 — 협의 완료, 적용 대기

허브 PC가 아니라 **시놀로지 NAS**이며, tailnet 합류로 협의됐습니다.

**결정된 방식**: NAS의 `/etc/hosts` 에 `100.121.175.2  mysado.net` 한 줄.
이 방식을 택한 이유는 **TLS 인증서를 그대로 쓸 수 있기 때문**입니다 — SNI·Host가 `mysado.net` 이라
Let's Encrypt 인증서가 유효하고, 허브 코드의 URL 문자열도 바꿀 필요가 없습니다.

### 5-1. 🔴 NAS 고유 함정 3건 (전달 필요)

| # | 함정 | 대응 |
|---|---|---|
| ⑴ | **Docker(Container Manager) 안이면 호스트 `/etc/hosts` 무효** | `extra_hosts: - "mysado.net:100.121.175.2"` (compose) 또는 `--add-host`. **컨테이너 재생성 필요** |
| ⑵ | DSM 업데이트가 `/etc` 커스터마이징을 되돌림(시놀로지 공식 입장: "지원하지 않는 변경") | 제어판 → 작업 스케줄러 → **부팅 시** 트리거, root: `grep -q 'mysado.net' /etc/hosts \|\| echo '100.121.175.2  mysado.net' >> /etc/hosts` |
| ⑶ | Tailscale 패키지 연결·ACL | `tailscale status` 로 미니PC 노출 확인 |

⑵를 빼면 **지금은 되고 몇 달 뒤 DSM 업데이트 직후 조용히 죽는** 구성이 됩니다.

**미확정 1건**: 통합 프로그램이 DSM 직접 설치인지 Container Manager 안인지 — 우승문 대표 확인 필요.
이것이 ⑴의 적용 위치를 가릅니다.

### 5-2. NAS 검수 절차

```bash
tailscale status                  # 미니PC(100.121.175.2) 보이는가
tailscale ping 100.121.175.2
ping -c1 mysado.net               # 100.121.175.2 여야 함 (공인 IP면 hosts 미적용)
curl -sv https://mysado.net/ -o /dev/null    # TLS 검증 통과
```

Docker 안이면 **컨테이너 내부에서** 같은 명령을 다시 확인해야 합니다.

### 5-3. 부작용

NAS에서 `mysado.net` 으로 나가는 **모든** 트래픽이 tailnet 경유가 됩니다.
tailnet이 끊기면 그 NAS에서만 쇼핑몰이 안 보입니다. 허브 전용이면 무해합니다.

---

## 6. 검증 기록

### 6-1. 전 경로 E2E (미검증 0건)

| # | 경로 | 결과 |
|---|---|---|
| ① | 무키 (dev) | 401 / 로그 `missing_bearer` ✅ |
| ② | 잘못된 키 (dev) | 401 / 로그 `unknown_key` / **본문 ①과 동일** ✅ |
| ③ | 유효 키 (dev) | 200 / `scopes:["orders:read"]` / `serverTime +09:00` ✅ |
| ④ | rate limit (dev) | 1~60 `200`, **61 `429`** ✅ |
| ⑤ | `lastUsedAt` 갱신 | NULL → 값 ✅ (fire-and-forget 커밋 실증) |
| ⑥ | 앱 직접 (prod, :3000) | 401 ✅ |
| ⑦ | tailnet 경유 (prod) | **401** ✅ (403 아님 = allow 통과 후 앱이 거절) |
| ⑧ | 공인 IP 경유 (prod) | **403** ✅ ← 이번 세션의 목표 |
| ⑨ | 유효 키 (prod, tailnet+TLS) | **200** ✅ |
| ⑩ | `Retry-After` (prod) | 429 + `retry-after: 22` ✅ |

⑦과 ⑧의 구분이 핵심입니다. ⑦이 403이었다면 tailnet allow가 안 먹은 것입니다.
⑨는 **허브가 실제로 밟을 전 경로**(tailnet DNS → TLS → Nginx allow → 라우트 → 인증 → 봉투)입니다.

⑧은 `--resolve` 로 공인 IP(175.119.78.63)를 강제해 헤어핀 NAT로 판정했습니다.

### 6-2. 🔴 prod 첫 시도 401 — 원인은 빈 변수

⑨의 첫 시도가 401이었습니다. dev에서 같은 키가 200이었으므로 앱·Nginx를 의심할 상황이었으나,
**두 증거가 1분 만에 원인을 갈랐습니다**:

```
echo -n "$MSD_KEY" | wc -c   →  0          변수가 이 셸에 없음
로그 logReason               →  missing_bearer  (unknown_key 아님)
```

`read -rs` 로 담은 셸과 다른 탭이었습니다(dev 서버를 별도 탭에서 띄우며 갈림).
`unknown_key` 가 아니었다는 사실이 **해시 불일치 가능성까지 배제**해 줬습니다.

> **교훈**: §3-3의 "응답은 구분하지 않되 로그는 구분한다"가 첫 실전에서 값을 했습니다.
> 로그가 401을 뭉뚱그렸다면 앱·Nginx·해시를 차례로 팠을 것입니다.
> 정본 규약 "빈 출력은 도구 문제가 아닐 수 있다"의 **입력판**이기도 합니다 —
> 401을 보고 인증 로직을 의심했지만 실제로는 입력이 비어 있었습니다.

### 6-3. 🟡 `now() - last_used_at` 이 9시간을 보여준 건

```
last_used_at  2026-08-12 09:34:11.971   (UTC 저장)
serverTime    2026-08-12 18:34:11+09:00 (같은 순간)
ago           09:01:39                  ← 방금 호출했는데
```

**데이터는 정확하고 제 쿼리가 틀렸습니다.** 컬럼이 `timestamp without time zone` 이라
PostgreSQL이 KST 세션의 `now()`(18:35)와 UTC 저장값(09:34)을 같은 기준으로 빼서 9시간이 남았습니다.
정본 규약의 "Prisma DateTime은 UTC 저장" 함정이 **뺄셈 형태**로 나타난 것입니다. §0에 회피법 기록.

### 6-4. 정적 검사 (dev·prod 양쪽)

```
dev   npx tsc --noEmit          에러 0
      npx next lint --file×5    ✔
      grep "class .* extends" lib/api-v1/ app/api/v1/   0건
      해시 표현 대조             keys.ts:1 / script:1, 문자 단위 동일(따옴표 제외)
prod  prisma generate           ✔ v6.19.3 (버전 고정 유지)
      npm run build             ✓ Compiled / ✓ types / 38 pages (37→38)
      라우트                     ƒ /api/v1/ping  (동적)
```

> **`npm run build` 에 `prisma generate` 가 없습니다**(`"build": "next build"`).
> prod 배포 시 **generate를 별도 선행**해야 합니다. 빼면 `prisma.apiClient` 타입 에러로 빌드 실패.

### 6-5. 마이그레이션

```
migrate diff --script   CREATE TABLE 1건 / DROP·TRUNCATE·ALTER COLUMN 0 / 기존 테이블 언급 0
migration.sql 실측      cat -n 17줄, warn·업그레이드 박스 0건 (stderr 분리 확인)
migrate deploy          14 migrations found → 1건 적용 → successfully applied
psql \d api_client      컬럼 9 / 인덱스 2 (pkey, key_hash UNIQUE) / scopes 기본값 ARRAY[]::text[]
백업                    ~/db-backups/mysado_db-2026-08-12-pre-50apikey.sql
                        663K / COPY 15블록 / product 228행 / inventory_source 3회 / dump complete
```

`inventory_source` 문자열 존재가 **"49차 이후 상태를 담은 백업"임을 증명**하는 지표였습니다.
파일 크기만으로는 알 수 없습니다.

---

## 7. 발급된 자격증명

```
name        hub-jusung
id          cmspvftej0000oqjtpdonr3lm
key_prefix  msd_Pwv10FZs
scopes      {orders:read}
평문         Chris 보관 (DB에는 SHA-256만, 복구 불가)
```

**`inventory:write` 를 지금 넣지 않은 이유**: 51차 orders API가 첫 소비자이고, 재고 쓰기는 52차입니다.
아직 없는 API의 권한을 미리 쥐여주지 않습니다(최소 권한). **스코프는 컬럼이라 재발급 없이 UPDATE 가능**합니다.

> dry-run도 난수를 소비하므로 **dry-run 접두와 실제 발급 접두는 다릅니다**(§9-2).

---

## 8. 산출물

| 경로 | 내용 |
|---|---|
| `prisma/migrations/20260812124500_add_api_client/` | CREATE TABLE 1건 (`d17f322`) |
| `lib/api-v1/response.ts` | 67줄 — 봉투 2종·오류코드·`isoWithOffset` |
| `lib/api-v1/keys.ts` | 28줄 — 생성·SHA-256·접두 (의존성 `node:crypto` 만) |
| `lib/api-v1/rate-limit.ts` | 54줄 — 인메모리 고정 윈도 |
| `lib/api-v1/auth.ts` | 90줄 — Bearer 파싱·조회·스코프·`lastUsedAt` |
| `app/api/v1/ping/route.ts` | 39줄 — 인증 → rate limit → 봉투 |
| `scripts/api-client-issue.js` | 172줄 — 기본 dry-run, `--apply` 시 평문 1회 출력 |
| `/etc/nginx/sites-available/mysado` | `location /api/v1` 삽입 (백업 `.bak-50차`) |
| `outputs/작업지시서-50차-api-v1-인증기반.md` | Claude Code 지시서 (gitignore) |
| `~/db-backups/mysado_db-2026-08-12-pre-50apikey.sql` | 663K |

기존 파일 **수정 0건** — `middleware.ts`·`lib/api-helpers.ts`·결제 라우트 전부 무접근.

---

## 9. 이월 항목

### 9-1. 신규 (50차 발생)

| # | 항목 | 비고 |
|---|---|---|
| 1 | **`touchLastUsedAt` 실패가 조용히 사라짐** | Map을 먼저 갱신하고 update를 던지므로, update 실패 시 5분간 재시도 없음. `.catch(()=>{})` 라 로그도 없음. 감사용 부가 정보라 기능 영향 없어 수용 |
| 2 | dry-run이 난수를 소비 | `--apply` 검사보다 키 생성이 위. 유출은 아니나 dry-run 접두 ≠ 발급 접두 |
| 3 | **NAS hosts 적용 + 부팅 시 자가복구** 🔴 | §5. Docker 여부 확인이 선행. **이것이 51차의 실질 선행조건** |
| 4 | `ApiRequest` 멱등성 테이블 | 52차(쓰기 API)에 신설 |
| 5 | `scripts/*.js` 의 `FatalError extends Error` 관례 | 신규 스크립트는 `fail()` 함수로 감. `.js` 는 tsconfig `include` 밖이라 ES5 무관하므로 양쪽 다 유효 |
| 6 | `error.details` 키 미구현 | 34차 §5-8 정의. 소비자 생길 때 |

### 9-2. 기존 이월 (49차에서 승계)

- **허브 API 나머지 단계** — ⑤ orders 읽기(51차) → StockMovement/동기화 로그 → 재고 SET(52차)
- **미등록 허브 SKU 10건** — `EF-XF916SBEG`(205개) 외 9건
- Admin CSV 일괄 재고 수정 (V6 검증에 HUB 차단, CP949/UTF-8·탭/콤마 자동 판별)
- `admin_audit_log` 47차 정리 미포함 — 확인 필요
- 웹훅 두 경로 미검증(43차) / Prisma 트랜잭션 타임아웃 5초
- 테스트 주문 정리 / **기존 `PAID` 미차감분 `cancel` 호출 금지**(43차 §5-⑶)
- `product.status` DEFAULT `'SALE'` / `layer3b-write.js` V6
- `prod-066` 투명 / 42차 절단 18건 / `라이트블루` 3건
- prod-011 오타 / prod-154 `model_name`
- **Layer 3b 잔여 219건** — 병목은 이미지 준비
- mysado.co.kr 301 / 소셜로그인 / `admin-guard.ts` 타입 캐스트

### 9-3. 🔴 토스 라이브 (기한 2026-08-16 — **4일 남음**)

| 항목 | 상태 |
|---|---|
| 라이브 계약 | 심사 중 |
| 8-2 조건부 재고 차감 / footer / 정책 | ✅ 완료 |
| 라이브 웹훅 실발신 수신 확인 | ⚠️ 심사 통과 전 불가 |
| 키 교체 → prod 재빌드 (`NEXT_PUBLIC_*` 빌드타임) | 계약 승인 직후 |
| 폴백 cuid 제거 / `customerMobilePhone` 010 가드 / 채번 동시성 재시도 | 계약 승인 직후 |

**심사 통과 시 8-3 묶음이 51차보다 우선입니다.**

---

## 10. 새로 확립된 원칙

**⑴ ES5 제약은 클래스만이 아니다** — `for...of` 도 `downlevelIteration` 없이 TS2802.
43차가 클래스만 짚었으나 범위가 더 넓습니다. `target` 을 지정하지 않는 한 계속 나타납니다.

**⑵ 0건의 원인에 "도구 특성"을 추가한다** — `grep -r` 은 심볼릭 링크를 따라가지 않습니다.
44~49차의 0건은 패턴 오류였으나 이번은 도구였습니다. **0건을 만나면 패턴·대상·도구 셋을 의심합니다.**

**⑶ 응답은 뭉뚱그리고 로그는 구분한다** — 보안상 응답을 통일하되 서버 로그에 사유를 남기면,
장애 판별 시간이 극적으로 줄어듭니다(§6-2에서 1분 만에 원인 확정).

**⑷ 봉투가 둘인 것은 부채가 아니라 경계다** — 소비자가 다르면(브라우저 vs 외부 프로그램)
형태가 달라도 됩니다. 단 **"언젠가 통일"이 아니라 "경계가 여기"라고 문서에 적어야** 설계가 됩니다.

**⑸ 실패 검증은 성공 검증보다 먼저 한다** — 무키 401을 먼저 확인해야 그다음 200이
"인증이 통과한 결과"임을 알 수 있습니다. 200부터 보면 인증이 없는 것과 구분되지 않습니다.

**⑹ 셸 변수는 탭을 건너지 않는다** — `read -rs` 로 담은 값은 그 셸에만 있습니다.
검증 명령을 여러 탭에 나눠 실행할 때 조용히 빈 값이 됩니다(§6-2).

---

## 11. 51차 착수 후보

**A. 8-3 토스 라이브 전환 묶음** — 심사 통과 시 **최우선**. 기한 4일.

**B. ⑤ `GET /api/v1/orders`** (34차 §5-3) — 읽기 전용, 위험 최소.
`(updatedAt, id)` 복합 커서 / 정렬 `updatedAt ASC, id ASC` 고정 / PII 로그 마스킹.
`orders:read` 스코프가 이번에 발급돼 있어 **키 재발급 없이 바로 검증 가능**합니다.
단 **§5(NAS hosts) 적용 전에는 허브 실연동 검증이 불가**하므로, 순서상 NAS 작업을 앞세우는 것이 좋습니다.

**C. NAS hosts + 부팅 자가복구 적용** — Docker 여부 확인 후. 30분 작업이며 B의 선행조건.

> 권장: **C(또는 우승문 대표 회신 대기) → B**. A가 끼어들면 A 우선.

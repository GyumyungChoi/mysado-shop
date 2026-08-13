# Phase 7 — 49차 핸드오프

**일자** 2026-08-11
**주제** `inventory_source` 컬럼 신설(additive) · 허브 관리 111행 초기화 · 재고 관리 주체 이원화
**커밋** `55dddce`(feat) — push 완료
**배포** 없음. **런타임 코드 0줄** — 빌드·재시작 없음 (pm2 ↺ 36 유지)
**DB write** 스키마 `ALTER TABLE ADD COLUMN` 1건 + `UPDATE 111`
**백업** `~/db-backups/mysado_db-2026-08-11-pre-49invsource.sql` (661,500B / 15 COPY 블록 / product 228행 실측)

---

## 0. 세션 시작 프로토콜 (50차는 여기서)

```bash
pm2 ls                                                    # online, ↺ 36
curl -so /dev/null -w "%{http_code}\n" localhost:3000     # 200
ss -tlnp | grep ':3001' || echo '3001 없음'
cd ~/apps/mysado-shop      && git log --oneline -1         # 55dddce
cd ~/apps/mysado-shop-prod && git log --oneline -1         # 6d0610c (두 칸 뒤 — 정상, §7-2)
```

DB 정합 (psql 단독):

```bash
psql -h localhost -U mysado -d mysado_db -P pager=off -c "SELECT inventory_source, count(*) AS rows, sum(stock_quantity) AS units FROM product GROUP BY 1 ORDER BY 1;"
```

```
HUB      111 |  362
MANUAL   117 | 6127
```

전체는 228 / 6,489 / orders 0 (48차와 불변).

---

## 1. 이번 세션의 결과

48차 §13-A의 5단계 중 **①②를 닫았습니다.** ③④⑤(API 본체)는 기능 세션이라 분리했습니다.

| 항목 | 48차 종료 | 49차 종료 |
|---|---|---|
| `inventory_source` 컬럼 | 없음 | **존재** (text NOT NULL DEFAULT `'MANUAL'`) |
| 허브 관리 대상 표현 | 문서에만 (111/117) | **DB에 표현** |
| 마이그레이션 | 12개 | **13개** |
| 재고 관리 주체 | 미분리 | HUB 111(362) / MANUAL 117(6,127) |
| 커밋 | 없음(문서만) | `55dddce` |

**48차 §8 표가 처음으로 DB 상태가 됐습니다.** 게이트 ①의 잔여 범위(수작업 117행 6,127유닛)가 이제 쿼리로 조회됩니다.

기본값 `MANUAL`이 안전 방향이라는 설계(48차 §8-2)가 실행 중에도 값을 했습니다 — ①만 적용되고 ②가 지연됐다면 228건 전량이 `MANUAL`이 되어 **허브 SET이 전건 거부될 뿐 재고는 덮이지 않는** 상태였습니다.

---

## 2. 🔴 새 절차 — 공유 DB에서 `--create-only` 대체 경로

정본 규약은 마이그레이션 SQL의 육안 검사를 위해 `--create-only`를 요구하는데, **그 플래그는 `migrate dev`에만 있고 `migrate dev`는 공유 DB에서 금지**입니다. 두 요구가 충돌합니다.

해법:

```bash
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel   prisma/schema.prisma \
  --script
```

- `--from-schema-datasource` = 스키마 파일에서 **접속 정보만** 읽어 라이브 DB의 현재 상태를 가져옴
- `--to-schema-datamodel` = 같은 파일의 **모델 정의**를 읽음
- 둘의 차이가 SQL로 출력됨. **쓰기 없음, 셰도 DB 없음, 적용 없음**

이 출력을 육안 검사한 뒤 마이그레이션 디렉터리에 저장하고 `migrate deploy`로 적용합니다. `--create-only`의 의도(적용 전 SQL 검사)를 그대로 얻으면서 `migrate dev` 경로를 밟지 않습니다.

**전체 순서 (다음 additive 마이그레이션에도 그대로 재사용)**

```
A  pg_dump 백업 + 내용 실측(행수 — 파일 크기 아님)
B  schema.prisma 편집 (exact-match count==1 가드)
C  migrate diff --script → SQL 육안
D  mkdir + 리다이렉트 저장 → cat -n 재확인
E  migrate deploy → prisma generate → tsc --noEmit
F  독립 psql 교차검증
```

**D의 `cat -n` 재확인이 생략 불가입니다.** 리다이렉션이 warn 줄이나 업그레이드 안내 박스를 함께 담으면 SQL 문법 오류가 납니다. 이번엔 warn이 stderr로 가서 파일에 SQL 2줄만 남았지만, 그것은 확인한 결과이지 전제가 아닙니다.

> Prisma 업그레이드 안내(6.19.3 → 7.9.1)가 모든 명령에 출력됩니다. **버전 고정은 정본 규약이므로 무시합니다.**

---

## 3. ① 컬럼 신설

### 3-1. 스키마 편집

`model Product`의 그룹 절(156~160행)과 네이버 채널 절(구 162행) 사이에 절을 신설했습니다.

```prisma
  // ── 재고 관리 주체 (Phase 7 49차 — 허브 연동 additive 2026.08.11) ──
  // HUB: 통합관리 프로그램이 10분마다 SET / MANUAL: Admin 수기·업로드
  inventorySource String @default("MANUAL") @map("inventory_source")
```

편집 전 `cat -n`으로 빈 줄 위치를 확인(45차 §8-⑴)하고, python3 exact-match + `count==1` 가드로 적용했습니다. 한글은 `\uXXXX`로 이스케이프해 붙여넣기 과정의 인코딩 변형을 차단했습니다.

**`String`(자유 문자열)이며 PostgreSQL enum이 아닙니다.** `product.status`의 선례를 따릅니다 — enum은 값 추가 시 `ALTER TYPE`이 필요해 additive-only 규약과 마찰하고, 값 검증은 `lib/` 상수로 하는 것이 이 프로젝트의 방식입니다.

### 3-2. 생성된 SQL (육안 검사 통과)

```sql
-- AlterTable
ALTER TABLE "product" ADD COLUMN     "inventory_source" TEXT NOT NULL DEFAULT 'MANUAL';
```

중단 조건 전부 해당 없음: `DROP`·`TRUNCATE`·`ALTER COLUMN` 0 / `product` 외 테이블 언급 0 / `CREATE TABLE` 0 / 빈 출력 아님.

`CREATE TABLE`이 0이었다는 것은 **12개 마이그레이션이 전부 반영돼 있고 이 컬럼 하나만 차이**라는 뜻입니다(`migrate status`의 `up to date`를 SQL 층에서 재확인).

`ADD COLUMN ... NOT NULL DEFAULT`는 PostgreSQL 11+에서 테이블 재작성 없이 카탈로그만 갱신하므로 228행에서 즉시 완료됩니다. prod 무중단.

### 3-3. 적용·검증

```
migrate deploy   13 migrations found → Applying → All migrations have been successfully applied
prisma generate  ✔ v6.19.3
tsc --noEmit     에러 0        ← 기본값 있는 필드라 create 호출부 무영향
git status       M schema.prisma + ?? migrations/  (범위 밖 변경 0)
\d product       inventory_source | text | not null | 'MANUAL'::text
분포             MANUAL 228 / 6,489 (단일 행)
```

---

## 4. ② 허브 관리 111행 초기화

### 4-1. 착수 전 확인 — 111의 재현

48차 §12 산출물 표에 **111을 판별한 매칭 절차가 기록돼 있지 않았습니다.** 이카운트 CSV는 `outputs/ecount_inventory_stock_temp.csv`에 있었으나(`ls | tail -20`에 안 잡힌 이유는 이름순 정렬), mtime이 8/11로 48차 세션보다 뒤라 판본 동일성부터 확인했습니다.

**바이트 실측으로 48차 최종판 동일본 확정:**

```
file      ISO-8859 text, CRLF        od -c 0xC7B0 0xB8F1 → CP949 「품목코드」
구분자    \t (탭)
헤더      품목코드·주문수량·재고수량·창고코드·창고명·품목명·품목명규격·기준일자·조회방식·조회결과존재
전량      rows 121 / 주문합 86 / 재고합 614 / 창고100 단일 / 중복 0 / 빈행 0
제외분    IP000 0건 · EF-US937CTE 0건        ← 48차 §5 판본 이력과 일치
```

`품목명` 열은 여전히 **전량 공백**입니다. 우승문 대표께 요청할 항목(48차 §7-4 추가 후보)이 유효합니다.

### 4-2. 코드 추출 — 보이지 않는 문자 검사

```bash
awk -F'\t' 'NR>1{gsub(/\r/,""); if($1!="") print $1}' ecount_inventory_stock_temp.csv \
  | iconv -f CP949 -t UTF-8 > /tmp/hub_codes.txt
```

| 검사 | 결과 |
|---|---|
| 행수 | 121 ✅ |
| 중복 | 0 ✅ |
| **비ASCII 문자** | **0** ✅ |

마지막 검사가 핵심이었습니다. 코드에 CR이나 인코딩 잔재가 하나라도 붙으면 **조인이 조용히 실패**해 111보다 작은 수가 나오고, 그것을 "매칭 안 되는 상품"으로 오독하게 됩니다. 48차 §4-1(`KR` 표기 차이)과 같은 계열이되 원인이 눈에 안 보여 더 나쁩니다.

### 4-3. 111 재현 성공

`\copy`는 psql **메타명령**이라 `-c`의 SQL 문자열에 섞을 수 없습니다(`syntax error at or near "\"`). SQL 파일 + `-f`로 전환했습니다.

```sql
CREATE TEMP TABLE hub_code(code text);
\copy hub_code FROM '/tmp/hub_codes.txt'
SELECT ... FROM product p
LEFT JOIN hub_code h ON h.code = regexp_replace(p.sku, 'KR$', '');
```

```
loaded 121 / uniq 121
matched 111  sku_only 67  no_sku 50  total 228      (111+67+50 = 228 ✅)
matched_units 362                                    (362 + 6,127 = 6,489 ✅)
```

**절차 기록 없이도 48차 §4-4 분해가 독립적으로 재현**됐습니다. 매칭 규칙 `regexp_replace(sku,'KR$','')`이 옳다는 증거입니다.

### 4-4. 대상 목록 육안 검수

```
rows 111 / stock sum 362      ← 행 단위 재합산이 집계값과 독립 경로로 일치
prod-050 · prod-051            0    ← 48차 삭제분 미부활
(111 rows) 표시                ✅
```

집계 쿼리의 `matched_units 362`와 목록 행을 하나씩 더한 362가 같다는 것이, 숫자와 대상 집합이 실제로 대응한다는 확인입니다.

### 4-5. UPDATE (가드 4 + 단일 트랜잭션)

`outputs/`가 아닌 `/tmp/49_invsource.sql`에 작성했습니다(임시 검증물).

```
가드 ①  hub_code 행수 = 121
가드 ②  product 총행수 = 228
가드 ③  inventory_source='MANUAL' 행수 = 228     ← 재실행 방지 겸함
가드 ④  조인 대상 행수 = 111
```

`psql -1 -f` 실행 결과:

```
CREATE TABLE / COPY 121 / DO / UPDATE 111
 HUB     111 |  362
 MANUAL  117 | 6127
```

`DO`가 예외 없이 지나갔다는 것이 가드 4개 전부 실행·통과의 증거이고, `UPDATE 111`이 범위 확증입니다. 가드는 자동 보정하지 않습니다.

### 4-6. 독립 교차검증 (47차 5단계 ⑤)

새 연결에서 재조회:

```
inventory_source | rows | units | no_sku | kr
HUB              |  111 |   362 |      0 |  8
MANUAL           |  117 |  6127 |     50 |  9
```

- `HUB`의 `no_sku` **0** — `sku` 없는 행이 허브 관리로 새어 들어가지 않음
- `MANUAL`의 `no_sku` **50** — 50건 전부 수작업 쪽
- `kr` 8+9 = **17** — 48차 §4-3 실측과 일치

---

## 5. 절차 사고 3건 (기록)

### 5-1. 🔴 제 명령 블록 말미 오염 — 48차 §11-1-7 재발

psql 명령 말미에 `</br>`가 섞여 나갔고 뒤따르는 설명문 전체가 셸로 흘러들어갔습니다. **48차 §3-5가 겪고 §11-1-7에 이월한 바로 그 사고이며, 이번엔 제가 만든 쪽입니다.**

DB는 무사했습니다 — psql 줄이 문법 오류로 죽어 실행되지 않았고 나머지는 `command not found`였으며, 쓰기 명령이 아니었습니다.

> **규약 (49차 신설 ⓐ)**: 명령 블록과 설명을 같은 붙여넣기 단위에 두지 않는다. 코드 블록 뒤에는 반드시 빈 줄을 두고 설명을 시작한다. 말미 문자 확인은 **실행자와 작성자 양쪽의 의무**다.

### 5-2. 🔴 셸 stdout 사망 — 도구를 세 번 헛짚음

교차검증 psql이 **에러도 결과도 없이** 침묵했습니다. 저는 원인을 쿼리 표현(`'KR\$'` 이스케이프)으로 추정해 두 번 고쳐 재시도했고, 둘 다 침묵이었습니다. 세 번째에 `; echo "exit=$?"`를 붙였더니 **`echo`마저 출력이 없어** 원인이 psql이 아니라 셸의 fd 1임이 드러났습니다.

`exec 1>/dev/tty 2>/dev/tty`로 복구했고 즉시 정상 출력됐습니다. 원인은 앞선 검증에서 쓴 `-c "\o /tmp/hub_targets.txt"` 계열의 출력 리다이렉션으로 추정됩니다.

> **규약 (49차 신설 ⓑ)**: **빈 출력을 만나면 쿼리·도구를 먼저 의심하지 않는다.** `echo alive`로 셸 stdout 생존을 먼저 확인한다. 47·48차의 "0건은 패턴 오류일 수 있다"의 출력판이며, 이번엔 그 규약을 알고도 도구 쪽만 팠다.
> 파생: **`\o`처럼 출력 경로를 바꾸는 psql 메타명령은 검증 묶음에 섞지 않는다.**

### 5-3. 🟡 모집단 혼동 — `kr` 17 vs 8

목록 검수에서 `KR` 접미를 17건으로 기대했으나 8건이 나왔습니다. 오류가 아니라 **모집단이 달랐습니다**: 48차 §4-3의 17은 `has_sku 178` 전체에서 센 값이고, 검수 대상은 매칭된 111행 안이었습니다. 나머지 9는 `sku_only 67` 쪽에 있고, §4-6에서 8+9=17로 닫혔습니다.

그대로 넘어갔어도 결과는 옳았겠지만 **근거가 틀린 채 통과**했을 것입니다. 숫자 불일치를 "정규화가 덜 작동했다"로 읽지 않고 모집단을 되짚은 것이 맞았습니다.

---

## 6. 🔴 게이트 ① — `HUB` 111행 재고는 아직 미검증값입니다

컬럼이 생겼다고 재고가 맞아진 것이 **아닙니다.**

```
HUB    111행 / 362유닛   ← 허브 최초 SET 수신 전까지 명목값. 신뢰 금지
MANUAL 117행 / 6,127유닛 ← 48차 §11-1-5. 실물 확정 미착수
```

48차 §5가 확정한 대로 우리 DB의 6,489는 명목값이며, 이카운트 실물은 614입니다. `HUB` 111행의 362는 **허브가 첫 SET을 보내는 순간 전량 덮입니다** — 그것이 게이트 ①의 "최초 SET 수신·교차검증"이 필요한 이유입니다.

게이트 ① 폐쇄 조건 (48차 §8 정의 유지):

```
① API 구현            ← 50차~
② 허브 최초 SET 수신·교차검증
③ 수작업 117행 재고 실물 확정   ← Admin 업로드 기능(48차 §8-1)이 선행
```

---

## 7. 상태·배포

### 7-1. 변경 내역

```
prisma/schema.prisma                       +4 (주석 2 + 필드 1 + 빈 줄 1)
prisma/migrations/20260811190000_.../       신규 (SQL 2줄)
런타임 코드 (app/·lib/·components/)         무수정
```

빌드·재시작 없음. pm2 ↺ 36 유지.

### 7-2. 🟡 prod 두 칸 뒤 — 의도된 상태이나 누적 중

```
dev   55dddce  feat(inventory) inventory_source
      49dade6  docs(claude) 47차 규약
prod  6d0610c
```

둘 다 런타임 무영향이라 배포하지 않았습니다. 컬럼은 이미 공유 DB에 있고, prod의 Prisma Client는 컬럼을 명시 나열하므로 모르는 컬럼이 하나 늘어도 정상 동작합니다.

다만 **42차 §2가 경고한 "격차의 조용한 누적"** 패턴이며, 이번엔 스키마 커밋까지 대기열에 들어갔습니다. 50차 API 배포 때 세 커밋이 한꺼번에 넘어가므로 **그 시점 빌드는 평소보다 주의**해서 봐야 합니다.

---

## 8. 이월 항목

### 8-1. 신규 (49차)

| # | 항목 | 비고 |
|---|---|---|
| 1 | **명령 블록 말미 오염** | §5-1. 48차 §11-1-7 재발. 작성자 의무로 승격 |
| 2 | **빈 출력 시 셸 생존 확인** | §5-2. `\o`를 검증 묶음에 섞지 않음 |
| 3 | `migrate diff` 대체 경로 | §2. **CLAUDE.md 또는 정본 규약에 추가 권장** — 공유 DB에서 `--create-only`가 불가하다는 사실이 규약에 없음 |
| 4 | CSV `품목명` 공백 | §4-1. 우승문 대표 요청 후보 (48차 §7-4 승계) |

### 8-2. 해소

- ✅ **`inventory_source` 컬럼** (48차 §11-1-1) — 신설·초기화 완료
- ✅ **111 매칭 절차 미기록** — 재현 절차를 §4-3에 기록. `/tmp/hub_match.sql` 방식 재사용 가능

### 8-3. 기존 이월 (승계)

- **Admin 재고 일괄 수정(CSV 업로드)** (48차 §8-1) — 수작업 117행의 유일한 갱신 수단. `inventory_source='HUB'` 차단(V6)이 이제 구현 가능
- **미등록 10코드 등록** (48차 §6-2) — 1순위 `GP-FPR640` 3색(84개)
- **재임포트 제외 목록** `13204642205`·`13204238197` — 스마트스토어 판매중지가 근본 조치
- **수작업 117행 6,127유닛 실물 확정** — 게이트 ① 잔여
- CSV 규격 변동(인코딩·구분자 자동 판별 필수) / `admin_audit_log` 미점검
- `product.status` DEFAULT 구값 `'SALE'` — **`\d product`로 실물 확인됨.** 옆 주석 `// SALE/OUTOFSTOCK/SUSPENSION`도 6값 체계와 어긋남. `ALTER COLUMN`이 필요해 별건 세션 대상
- `layer3b-write.js` V6 전역 유일성 / `deriveIsVisible` 복제 3곳
- 42차 절단 18건(`라이트` 10·`다크` 8) / `라이트블루` 3건 / `prod-066` 투명
- prod-011 `로열핑/뱅` / prod-154 `model_name` / `variant_label` 40자 절단
- 7-3 게시 게이트 / mysado.co.kr 301 / 소셜로그인
- 웹훅 두 경로 미검증 / Prisma 트랜잭션 타임아웃 5초 / 장바구니 수량 직접 입력
- `app/api/mypage/addresses/*` raw SQL 3건

### 8-4. 🔴 오픈 게이트 4건

| # | 게이트 | 상태 |
|---|---|---|
| ① | API 구현 + 허브 최초 SET 수신·교차검증 + 수작업 117행 재고 확정 | 🟡 **선행 스키마 완료.** API·SET·실물 확정 잔여 |
| ② | 오프사이트 백업 | 🔴 미착수 |
| ③ | 다운타임 알림 | 🔴 미착수 |
| ④ | 라이브 웹훅 실발신 확인 | ⚠️ 토스 심사 통과 후 |

---

## 9. 산출물

| 경로 | 내용 |
|---|---|
| `prisma/schema.prisma` | `inventorySource` 필드 (커밋 `55dddce`) |
| `prisma/migrations/20260811190000_add_product_inventory_source/migration.sql` | SQL 2줄 (커밋 `55dddce`) |
| `~/db-backups/mysado_db-2026-08-11-pre-49invsource.sql` | 661K / 15테이블 / product 228 실측 |
| `/tmp/hub_codes.txt` | 121코드 UTF-8 (임시 — 세션 밖 보존 안 됨) |
| `/tmp/hub_match.sql` · `/tmp/49_invsource.sql` | 매칭 재현 / 가드 UPDATE (임시) |
| 본 핸드오프 | `outputs/` |

> `/tmp` 산출물은 재부팅 시 사라집니다. `hub_codes.txt` 생성 명령(§4-2)이 문서에 있으므로 재생성 가능하며, CSV 원본은 `outputs/ecount_inventory_stock_temp.csv`에 있습니다.

---

## 10. 50차 착수 권고

**A. API 본체 — ③④⑤** ← 권장

48차 §13의 잔여입니다. **순서 제약이 있습니다.**

```
③ API Key 인증 + 공통 응답 봉투 + Nginx 사내망(Tailscale) 제한
⑤ GET /api/v1/orders          읽기 전용, (updatedAt, id) 복합 커서
④ POST /api/v1/inventory/bulk SET, snapshotAt 보정, 항목별 부분 성공
```

**④는 ⑤ 없이 배포 금지입니다**(48차 §7-1). 허브가 자사몰 주문을 수집하지 못하는 상태에서 SET만 받으면 판매분이 소거되고 그 값이 타채널로 전파됩니다. ⑤만 배포하는 것은 읽기 전용이라 무해합니다. **역순 금지.**

③⑤가 한 세션, ④가 다음 세션이 현실적입니다. ④에는 `inventory_source='MANUAL'` 행에 대한 **400 거부**가 반드시 들어가야 합니다 — 이번 세션이 만든 컬럼의 첫 소비자입니다.

**B. Admin 재고 일괄 수정** (48차 §8-1) — 게이트 ①의 ③(수작업 117행 실물 확정)에 필요한 수단이며, `inventory_source='HUB'` 차단(V6)이 이제 구현 가능합니다. A와 독립적으로 진행 가능.

**C. 미등록 10코드 등록** — 34차 §4 INSERT 전용 스크립트 재사용. `GP-FPR640` 3색부터(형제 복제, 재고 84개 실재). 등록 시 `inventory_source`는 기본값 `MANUAL`로 들어가므로, 허브 대상이면 **등록 후 `HUB`로 변경하는 단계를 잊지 말 것.**

> **마감**: Toss 라이브 계약 **2026-08-16 (5일)** — 심사 중. 통과 시 8-3 묶음(키 교체 → prod 재빌드 → 폴백 cuid 제거 → `customerMobilePhone` 010 가드 → 채번 동시성 재시도)이 최우선으로 끼어듭니다. 그 배포에는 §7-2의 대기 중인 두 커밋도 함께 넘어갑니다.

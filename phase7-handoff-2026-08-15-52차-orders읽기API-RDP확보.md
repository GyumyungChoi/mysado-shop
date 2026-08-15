# Phase 7 — 52차 핸드오프

**일자** 2026-08-15
**주제** 트랙 B `GET /api/v1/orders` 구현 · 화면 신호 소실 대응 · **RDP 원격 복구 경로 확보** · 재부팅 자동복구 실증
**커밋** `390fd19`(feat) — push 완료
**배포** prod 미실시(의도적) / **DB 쓰기 0건** / 마이그레이션 0건 / **pm2 ↺ 37 → 0 (재부팅)**
**repo 밖 변경** Windows 4건(RDP 활성화·방화벽·서비스 시작유형) · WSL 1건(`ssh` enable)

---

## 0. 세션 시작 프로토콜 (다음 세션은 여기서 시작)

```bash
pm2 ls                                                    # online, ↺ 0 (재부팅 후 리셋됨)
curl -so /dev/null -w "%{http_code}\n" localhost:3000     # 200
ss -tlnp | grep ':3001' || echo '3001 없음'
cd ~/apps/mysado-shop      && git log --oneline -1         # 390fd19 (+ 이 문서 커밋 시 그 해시)
cd ~/apps/mysado-shop-prod && git log --oneline -1         # 5332fd9
```

> **↺ 카운트 기대값이 37에서 0으로 바뀌었습니다.** 8/15 재부팅으로 리셋됐습니다.
> dev·prod는 **2칸 차이**입니다(`74362ac` 51차 문서 + `390fd19` 오늘 기능). 의도된 상태이며,
> 다음 prod 배포 때 함께 넘어갑니다.

DB 상태(52차 실측):

```
product        228행
orders         0행       ← 47차 삭제 이후 신규 주문 없음
order_item     0행
api_client     1행 (hub-jusung / scopes {orders:read} / is_active t / revoked null)
sitemap        218건     ← 42차 기록 220에서 2건 감소 (§7-1-3)
```

---

## 1. 이번 세션의 성격 — 기능 하나, 인프라 셋

트랙 B를 구현·커밋한 뒤 **미니PC 화면 신호가 끊긴 상황**이 겹쳤습니다. 위치 이동까지 예정돼 있어
"재부팅해도 되는가"가 실질 의제가 됐고, 세션 후반 전체가 그 답을 만드는 데 들어갔습니다.

결과적으로 얻은 것은 API 하나가 아니라 **원격 복구 경로 3층**입니다. 그중 하나는
**미리 확인하지 않았으면 재부팅과 동시에 서버를 잃을 뻔한 것**이었습니다(§5-3).

---

## 2. 트랙 B — `GET /api/v1/orders` 구현 완료

### 2-1. 신규 파일 4개 (374줄, 기존 파일 수정 0건)

| 경로 | 줄 수 | 역할 |
|---|---|---|
| `lib/api-v1/scopes.ts` | 13 | 스코프 리터럴 상수 |
| `lib/api-v1/orders.ts` | 247 | 파라미터 파싱 · 커서 · 직렬화 |
| `app/api/v1/orders/route.ts` | 65 | 목록 |
| `app/api/v1/orders/[id]/route.ts` | 49 | 단건 |

50차가 만든 `lib/api-v1/` 3종(`response`·`auth`·`rate-limit`)을 그대로 재사용했고 새 헬퍼를
만들지 않았습니다. `ping` 이 세운 **인증 → rate limit → 봉투** 순서를 따릅니다.

### 2-2. 정준 식별자 = `Order.id` (확정)

`order_number` 는 `String?` 이고, **Postgres UNIQUE는 NULL을 충돌로 보지 않습니다** — null 주문이
여럿 공존 가능한 구조입니다. 스키마가 보장하지 않는 값은 경로 키가 될 수 없습니다.

실데이터 0건이라 null 발생률은 측정 불가였으나, **측정할 필요가 없어졌습니다.** 34차가 `sku`를
버리고 `product.id`를 택한 것과 같은 판정 근거이며, 허브 매핑 테이블 축을 우리 `id`로 고정한
결정과도 일관됩니다. `orderNumber` 는 응답 필드·목록 필터로만 제공합니다.

### 2-3. 🔴 `order_item` 에 SKU 스냅샷이 없다 — 설계를 바꾼 발견

스냅샷은 `productName`·`unitPrice`·`quantity` 뿐이고 기계 판독 가능한 연결은 `productId` 하나이며,
그것도 `SetNull` 입니다. **상품이 삭제되면 그 주문 항목은 상품명 문자열만 남고 어떤 SKU였는지
영영 알 수 없습니다.** 29차 스냅샷 원칙이 가격·상품명에는 적용됐는데 식별자에는 빠져 있습니다.

당장의 문제는 **허브가 우리 주문 항목을 자기 재고와 맞추는 방법**입니다. 34차는 정준 축을
`product.id`로 고정했으나, 49차 실측에서 허브가 실제로 들고 있는 키는 **SKU**였습니다.
허브 쪽 매핑 테이블은 아직 없습니다. 그래서 둘 다 내보내되 성격을 다르게 명시했습니다.

| 필드 | 성격 | null 조건 |
|---|---|---|
| `productId` | 정준 키, 스냅샷 | 상품 삭제 시 |
| `sku` | **보조 키. 스냅샷이 아니라 상품 마스터의 현재값** | 상품 삭제 시 · sku 미보유 |

`sku` 는 **원본 그대로** 보냅니다. `KR` 접미 정규화는 비교 시점 규칙이지 전송 규칙이 아니며(48차),
미리 깎아 보내면 허브가 자기 원본과 대조할 방법을 잃습니다.

→ `order_item.sku_snapshot` additive 추가를 이월(§7-1-1).

### 2-4. 응답 형태

```
목록  { success:true, data:{ items:[…], nextCursor:"…"|null, hasMore:false } }
단건  { success:true, data:{ …주문 객체… } }        ← 목록처럼 감싸지 않음
```

주문 객체: `id` `orderNumber` `status` `totalAmount` `paidAt` `orderer{name,email,phone}`
`shipping{recipientName,recipientPhone,zipCode,address1,address2,deliveryMemo}` `lineItems[]`
`createdAt` `updatedAt`

**넣지 않은 키와 이유**

| 제외 | 이유 |
|---|---|
| `paymentKey` · `userId` | 토스 키 · 내부 신원. 허브 용도 없음 |
| 배송비 · 할인 | **컬럼 없음**(`totalAmount` 단일). 없는 값을 null로 내보내면 허브가 그 키를 계약으로 받아들이고, 실제 컬럼이 생겼을 때 의미가 조용히 바뀐다 |
| 택배사 · 송장 | 컬럼 없음. 송장 API 세션의 additive 이후 |
| `canceledAt` · 취소/반품 플래그 | 컬럼 없음. 취소는 `status=CANCELED`, 시각은 `updatedAt` 근사 |

배송지·주문자 스냅샷은 **포함**합니다(허브가 송장을 출력하고 CS를 받습니다). 34차 §5-3의 PII
규칙은 "응답 금지"가 아니라 **"로그 저장 금지"** 이고, 현재 로그는 인증 실패 사유만 남깁니다.

`total` 은 제공하지 않습니다 — 동기화 중 값이 변해 의미가 없고, 매 페이지 `count()` 비용만 듭니다.
`limit + 1` 을 읽어 `hasMore` 를 판정합니다.

### 2-5. 🔴 `isoWithOffset` 은 밀리초를 버린다 — 커서 정밀도 분리

`response.ts:66` 의 `slice(0, 19)` 때문에 응답 표시값은 **초 단위로 내림**됩니다.
`updated_at` 은 `timestamp(3)` 이므로 실제로는 밀리초가 있습니다.

허브가 표시값을 다음 `updatedAfter` 로 되먹여도 **내림이라 방향이 안전합니다** — 경계가 뒤로 밀려
이미 받은 주문이 한 번 더 올 뿐 유실은 구조적으로 불가능합니다. 반올림이었다면 유실이 났습니다.

그래도 정밀 증분은 커서로만 보장합니다. **커서에는 `toISOString()` 원본(ms 포함)을 넣어
표시 정밀도와 기계 정밀도를 분리**했습니다.

```
커서 = base64url(JSON.stringify({ u: updatedAt.toISOString(), i: id }))
```

서명하지 않습니다 — 위조로 얻는 것이 "다른 지점부터 읽기"뿐이고 이미 인증을 통과한 주체입니다.
Prisma의 `cursor` + `skip:1` 은 단일 컬럼 고유값 전제라 쓸 수 없어, `OR` 중첩으로 명시했습니다.

```ts
OR: [ { updatedAt: { gt: c.updatedAt } },
      { updatedAt: c.updatedAt, id: { gt: c.id } } ]   // orders.ts:206-209
```

**동률 처리의 정확성이 이 세 줄에 걸립니다.**

### 2-6. 400으로 떨어뜨리는 것 (조용한 폴백 없음)

| 조건 | 이유 |
|---|---|
| 목록 밖 파라미터 키 | `statuses=PAID` 같은 오타를 무시하면 허브가 전체를 받고도 필터가 걸린 줄 안다 |
| 날짜에 오프셋 없음 | JS `new Date()` 가 형식에 따라 UTC/로컬로 갈라 읽어 **조용히 9시간** 어긋난다 |
| `limit` 정수 아님 · 범위 밖 | 클램프하지 않는다 |
| `status` 알 수 없는 값 | |
| `cursor` 디코딩 실패 | **첫 페이지로 폴백하지 않는다** — 폴백하면 허브가 커서 손상을 모른 채 처음부터 다시 받고 아무도 관측하지 못한다 |
| `cursor` + `updatedAfter` 동시 | 우선순위를 숨기지 않는다 |

파라미터: `from`·`to`(→`createdAt`, gte/lt) · `updatedAfter`(→`updatedAt`, gt) · `status`(쉼표 다중값) ·
`orderNumber`(정확 일치) · `cursor` · `limit`(기본 100, 최대 500).
정렬은 `updatedAt ASC, id ASC` 고정이며 정렬 파라미터를 받지 않습니다.
유효 상태 어휘는 `lib/order-status.ts` 의 `STATUS_LABEL` 키에서 도출 — **상태가 늘면 자동으로 따라옵니다.**

### 2-7. 인덱스 없이 감

`(updated_at, id)` 정렬은 seq scan입니다. 현재 0건, 실운영에서도 수백 건 규모라 무의미하고,
넣으면 마이그레이션 세션이 되어 운영 원칙 2에 걸립니다. **이월 유지**(51차 9-1-5).

---

## 3. Claude Code 위임 결과 — 지시서에 코드를 전문 실었다

**신규 파일 4개라 exact-match 앵커가 존재하지 않고, 따라서 count 가드가 걸리지 않습니다.**
지시가 서술형이면 재량이 그대로 파일이 되고 그것을 막을 구조가 없습니다. 그래서 이번 지시서는
**코드를 값 수준으로 전문 고정**했고, 검증이 "지시서와 파일의 대조"로 환원됐습니다
(34차 원칙 2 "규칙보다 구조"의 신규 파일판).

폴백은 **하나만, 삭제할 줄을 지정해** 허용했습니다(`Prisma.validator` 타입 실패 시 `orderBy` 한 줄).
재량을 0으로 두면 왕복이 늘고, 열어 두면 조용한 설계 변경이 들어옵니다. 결과적으로 미적용.

### 3-1. 산출물 평가 — 42·45차 수준 유지

- **기대값과 실측이 어긋났을 때 파일을 고치지 않고 중단·보고.** "주석을 지우면 지시서 위반"이라는
  판단이 정확했습니다
- 역증명(`paymentKey` 패턴이 `app/api/payment/` 에서 히트하는지)을 지시받은 그대로 실행
- `Product.sku` 를 `String? // null 50건` 까지 실측 보고 — 34차 실측(50건 부재)과 일치
- 지시서 밖 편집 0건, 임시 파일 0건

### 3-2. 🔴 불일치 2건은 전부 지시서 결함이었다

`grep -rn 'orders:read'` 기대값을 "1건"으로 적으면서 §5-A **주석에 같은 문자열을 넣어** 두었고,
`paymentKey|userId` 0건 기대도 §5-B 주석이 구조적으로 위반하게 만들었습니다.
**검사 패턴이 코드와 주석을 구분하지 않았습니다.**

> **규약 (52차 신설)**: 검사 기대값을 적을 때는 **주석 포함 여부를 명시**한다.
> 코드만 세려면 패턴을 코드에 한정하거나(따옴표 포함 리터럴), 기대값을 **"코드 N건 + 주석 M건"**
> 으로 적는다. 44~48차의 "0건은 패턴 오류일 수 있다"의 **역방향**(기대값 쪽 결함)이다.

---

## 4. 검증 기록

### 4-1. 독립 실측 (자체 보고 불신 규약)

```
wc -l          13 / 247 / 65 / 49 = 374    (agent 보고와 일치)
cat -n         scopes.ts 온전
grep           커서 OR 블록 206·208행 존재 / base64url 98·104행 / limit 상수 13·14행
npx tsc        exit 0
git status     ?? 3항목, 수정(M) 0건
find           app/api/v1/orders 아래 파일 정확히 2개
```

### 4-2. HTTP 검증 4/4 (dev 3001)

| # | 요청 | 결과 |
|---|---|---|
| ① | 인증 없음 | **401** ✅ |
| ② | 유효 키(`orders:read`) | **200** `{"items":[],"nextCursor":null,"hasMore":false}` ✅ |
| ③ | `?statuses=PAID` | **400** `알 수 없는 파라미터입니다: statuses` ✅ |
| ④ | `?cursor=zzz` | **400** `cursor가 올바르지 않습니다.` ✅ |
| ⑤ | `?from=2026-08-14` | **400** `from은 오프셋을 포함한 ISO 8601…` ✅ |

②가 200이므로 **`requiredScopes` 경로가 실행된 것은 이번이 처음**입니다 — ping은 스코프를
요구하지 않았으므로 `auth.ts:73-82` 가 여기서 처음 값을 했습니다.
④가 400인 것이 폴백 부재의 직접 증거입니다.

### 4-3. 🔴 미검증 (명시)

**주문이 0건이라 `serializeOrder` 는 호출조차 되지 않았습니다.** 247줄 중 절반 가까이가 미실행입니다.

| 미검증 항목 | 필요 조건 |
|---|---|
| 직렬화 전 필드 (`lineItems` 구조 · `sku` join · `orderer`/`shipping` 중첩) | 주문 ≥1건 |
| 커서 전진 (`nextCursor` 발급 → 다음 페이지) | 주문 ≥2건 + `limit=1` |
| `updatedAt` 동률 처리 | psql로 두 행 `updated_at` 동일값 구성 |
| `paidAt` null/값 분기 | 결제 완료 주문 |

커밋 메시지 마지막 `-m` 에 이 미검증 범위를 적었습니다 — `git log` 로 이 해시를 만나는 사람이
"curl 4종 통과"만 보고 전 경로 검증으로 읽으면, 51차가 50차 검증표를 정정해야 했던 일이
반복됩니다(43차 §8-⑵의 커밋 메시지판).

### 4-4. 4단계(테스트 주문) 설계 — 미착수

세션 후반이 인프라로 넘어가 착수하지 못했습니다. 설계는 확정돼 있습니다.

```
주문 2건 (계좌이체) → 차감 확인 → psql로 updated_at 동률 구성 → API 검증
→ 재고 수기 복원 → 5단계 절차로 주문 삭제 → 재고 재검증
```

- **47차 삭제가 코호트 문제를 없앴습니다.** 43차 §5-⑶("미차감 `PAID` 에 cancel 금지")은 43차 이전
  주문에 대한 것이고 그 45건은 이미 사라졌습니다. **지금 만드는 주문은 전부 차감 경로를 탄
  주문**이므로 왕복이 재고 정합을 깨지 않고, 덤으로 43차 코드가 실데이터로 재검증됩니다
- 상품 선정 조건: `inventory_source='MANUAL'`(HUB 행은 허브 SET과 섞임) · 재고 충분 ·
  **서로 다른 2개**(`lineItems` 배열 구조 검증) · 저가
- 정리는 cancel이 아니라 **삭제**. 어차피 지울 행에 취소 API를 태우면 검증 대상만 늘어납니다
- **삭제 전에 `order_item` 수량과 `payment_log` 건수를 세 둘 것** — CASCADE는 삭제 건수를
  출력하지 않습니다. 주문을 먼저 지우면 무엇을 얼마나 복원할지 알 수 없게 됩니다
- 51차 §7-3(`@updatedAt` 은 psql UPDATE에서 미갱신)이 여기서는 **함정이 아니라 도구**입니다.
  폐기 예정 행이므로 부작용도 없습니다

---

## 5. 인프라 — 화면 신호 소실 대응

### 5-1. 상황과 판단

DP·HDMI 모두 모니터 신호 없음 + 위치 이동 예정. 재부팅 자체는 가능하나 **실패 모드가
"불편"에서 "복구 불가"로 올라간 상태**였습니다 — WSL이 자동으로 뜨지 않으면 SSH·Nginx·
Tailscale이 전부 없고, 평소의 복구 수단(모니터·키보드)이 막혀 있었습니다.

그래서 순서를 **"재부팅해도 되는가"가 아니라 "화면 없이 되살릴 수 있는 상태를 먼저 만든다"** 로
바꿨습니다.

### 5-2. RDP 확보 — UAC 순환을 WSL interop으로 깼다

RDP를 켜려면 관리자 권한이 필요하고, UAC 동의 창은 **볼 수 없는 그 화면**에 뜹니다.
빠져나온 경로는 **WSL → Windows interop** 입니다.

```
초기 증상   cmd.exe: command not found   ← systemd=true 환경에서 PATH에 Windows 경로 미포함
실제        /mnt/c/Windows/System32/cmd.exe 절대경로로 호출 가능 (WSLInterop 등록 확인)
```

이것도 "0건/실패는 패턴 오류일 수 있다"의 한 형태였습니다 — `command not found` 는 "없다"가
아니라 **"그 이름으로는 못 찾았다"** 입니다.

`ConsentPromptBehaviorAdmin = 0x5`(동의 창 뜸)였으나 `best1` 이 Administrators 소속이라
**`reg.exe add` 가 그대로 통과**했습니다. 화면도 키보드도 필요 없었습니다.

| 조치 | 값 |
|---|---|
| `fDenyTSConnections` | `0x1` → **`0`** |
| 방화벽 | `netsh advfirewall … group="원격 데스크톱" enable=Yes` → **3규칙 갱신** |
| `TermService` START_TYPE | `DEMAND_START` → **`AUTO_START`** ← **이것이 없으면 재부팅 후 무의미** |
| `UserAuthentication` | `0x1` (NLA, 무변경) |
| 리스너 | `0.0.0.0:3389 LISTENING` 확인 |

**접속 정보**: `192.168.35.67` / 사용자 `minipc-92kst\best1` / 암호는 **Microsoft 계정 웹 비밀번호**.
로컬 암호·PIN이 아닙니다 — `net user` 출력의 `전체 이름 Gatos Los` 가 MS 계정의 표식이었고,
로컬 표기(`.\best1`)로는 로그온이 거부됐습니다.

**검증**: 노트북에서 실접속 성공, 미니PC 데스크톱(VS Code·WSL 터미널) 확인.
51차 §6-⑵("원격 피어가 있어야 성립하는 검증은 자기 호출로 대체할 수 없다")를 이번엔 처음부터 지켰습니다.

부수 진단: **RDP 화면이 정상이었다는 것은 Windows·GPU 렌더링이 멀쩡하다는 뜻**이고, 증상이
출력 경로에 국한된다는 근거였습니다. 실제로 이동 후 **HDMI로 복구**됐습니다.

### 5-3. 🔴 `ssh` 가 `disabled` 였다 — 이번 세션 최대 수확

```
systemctl is-enabled ssh          →  disabled     🔴
systemctl is-enabled postgresql   →  enabled
systemctl is-enabled pm2-chris    →  enabled
~/.pm2/dump.pm2                   →  10,956 bytes (8/12)
```

세션이 살아 있던 것은 누군가 수동으로 띄웠기 때문이고, **재부팅하면 SSH가 안 떴을 것**입니다.
RDP를 뚫어 두지 않았다면 재부팅 직후 화면도 SSH도 없는 상태가 됐습니다.

→ `sudo systemctl enable ssh` (심링크 2개 생성, `multi-user.target.wants` 포함) → 조회로 재확인.

> **교훈**: `pm2 save` 를 했다고 부팅 복구가 보장되지 않습니다. `pm2 save` 는 목록을 저장할 뿐이고
> 되살리는 것은 `pm2 startup` 이 만든 systemd 유닛입니다. 그리고 **그 앞단(WSL·sshd)이 뜨는가는
> 또 다른 층**입니다. 층마다 따로 확인해야 합니다.

### 5-4. WSL 자동 기동 — 이미 있었고, 로그온 의존

```
작업 스케줄러  \WSL Auto Start (mysado)    로그온 모드: 대화형/백그라운드
               \WSL2 Server AutoStart      로그온 모드: 대화형만
               둘 다 마지막 실행 2026-07-16 21:14, 결과 0, 실행 사용자 best1
AutoAdminLogon  1  /  DefaultUserName  best1
```

두 작업의 실행 시각이 `net user best1` 의 `최근 로그온`(7/16 21:14:42)과 초 단위로 일치 —
**트리거는 로그온**이고, 7/16이 마지막 부팅이었습니다(한 달 무중단).

`AutoAdminLogon=1` 이므로 부팅 → 자동 로그온 → 작업 발동 → WSL 기동이 성립합니다.
설령 자동 로그온이 없어도 **RDP 로그인 자체가 트리거를 발동**시키므로 복구 경로가 있었습니다.

작업이 2개 중복인 것은 이월(§7-1-5).

### 5-5. DB 백업 + 외부 반출

```
파일      ~/db-backups/mysado_db-2026-08-15-pre-move.sql   649K
검증      COPY 블록 16 / product 228 / orders 0 / 'dump complete' 확인
md5       27b44feb68891f241b022cd175be13ec
반출      노트북 Downloads/ (scp) — PowerShell Get-FileHash 대조 일치 ✅
```

**로드맵 N-1(오프사이트 백업)의 첫 실물**입니다. 자동화는 미착수이나, 수동 한 벌이 이동 리스크를
없앴습니다. 노트북도 함께 이동하므로 **클라우드 사본은 아직 권장 상태**입니다.

파일 끝의 `\unrestrict …` 줄은 최신 PostgreSQL이 덤프에 넣는 psql 메타명령입니다.
**복원 시 `psql -f` 를 써야 합니다**(`pg_restore` 로는 처리되지 않음).

### 5-6. 재부팅 실증 — 전 계층 자동 복구

```
종료      pm2 kill → systemctl stop postgresql → (RDP에서) wsl --shutdown → Windows 종료
복귀      전원 → 자동 로그온 → WSL → systemd → postgresql · pm2 · sshd 전부 자동
확인      pm2 ↺0 online / localhost:3000 200 / postgresql active / nginx active
          tailscale 100.121.175.2 (변동 없음) / https://mysado.net 200 (57ms) / sitemap 218
          WSL eth0 172.25.46.199 (부팅마다 변동, 무해)
화면      HDMI 복구 / DP 여전히 불통
```

**Tailscale IP가 유지된 것이 중요합니다** — NAS의 hosts 자가복구 스크립트(51차)가 이 주소를
박아 두었으므로, 바뀌었다면 대표께 재요청이 필요했습니다.

> ⚠️ **`pm2 kill` 이후 `pm2 save` 를 실행하면 빈 목록으로 덮어써집니다.** 이번엔 하지 않아
> `dump.pm2` 가 온전했고 복원이 됐습니다. 종료 절차에 이 금지를 포함할 것.

---

## 6. NAS 조치 계획 (51차 §10-B 재설계) — 미발행

51차는 "tun 전환"을 유일 해법으로 적었으나, **51차가 실측한 두 값이 그 경로를 가장 위험한
선택지로 만듭니다.**

```
실행 사용자   tailsca+   (root 아님)
/dev/net/tun  crw------- root root   (0600, 그룹조차 없음)
```

인자만 떼면 비root 데몬이 tun을 열지 못해 **기동 실패 → NAS가 tailnet에서 이탈**할 수 있고,
그 시점에 우리는 관측 수단이 없습니다. 남의 운영 장비입니다.

| 순위 | 경로 | 성격 | 대가 |
|---|---|---|---|
| ① | userspace 유지 + **SOCKS5 리스너 추가**(`--socks5-server=localhost:1055`) | 인자 **추가**(additive) | 허브 프로그램이 프록시 경유(1줄) |
| ② | tun 전환 | 모드 교체 | 권한 승격·기동 실패 위험·업데이트 회귀 |
| ③ | Nginx `allow` 에 공인 IP 추가 | 50차 보안 설계 되돌림 | 유동 IP면 조용히 끊김 |

①이 유력한 이유: **51차의 hosts 작업이 그대로 살아납니다.** `socks5://`(끝에 `h` 없음)는 이름
해석을 로컬에서 하므로 NAS `/etc/hosts` 가 `100.121.175.2` 로 답하고, 연결만 터널로 나가며
SNI는 `mysado.net` 이라 인증서도 맞습니다. **`socks5h://` 나 HTTP CONNECT 프록시는 해석을
tailscaled에 넘겨 공인 IP로 나가므로 여기서 갈립니다.**

검증 한 줄: `curl -s --socks5 127.0.0.1:1055 https://mysado.net/api/v1/ping`

**3라운드 비동기 설계**

1. **무변경 관측**(대표 5분) — `start-stop-status` 전문 · `conf/privilege` · `synopkg version` ·
   `lsmod | grep tun` · **"현재 tailnet으로 NAS의 무엇을 쓰고 있는가"**(②에서 잃을 수 있는 것) ·
   **허브 프로그램 수정 가능 여부**(이 답이 ①과 ②를 가릅니다)
2. **조치** — 파일 백업(`outputs/` 에 사본 동시 보관) → 인자 추가 → 재시작 → curl 1건 →
   실패 시 복원. **롤백 명령을 지시서 첫 페이지에**
3. **허브 프로그램** — 프록시 설정 + `/api/v1/ping` 200 → 그 시점에 API 키 전달(51차 9-1-7)

---

## 7. 이월 항목

### 7-1. 신규 (52차 발생)

| # | 항목 | 비고 |
|---|---|---|
| 1 | 🔴 **`order_item.sku_snapshot` additive** | §2-3. 송장 컬럼(`carrier_code`·`tracking_number`)과 같은 마이그레이션 세션에 묶는 것이 자연스러움 |
| 2 | `ping/route.ts:9` 주석 차수 표기 | `51차(orders:read)·52차(inventory:write)` — 실제와 어긋남. **숫자를 고치지 말고 차수를 지우고 기능명만 남길 것**(43차 §8-⑸의 코드 주석판) |
| 3 | **sitemap 220 → 218** | 42차 이후 2건 감소. 원인 미확인(비노출 상품 증가 추정). **218을 새 기준선으로 기록**하되 어느 2건인지는 미조사 |
| 4 | DP 포트 신호 없음 | HDMI 정상. 케이블 교체로 판별 |
| 5 | WSL 자동시작 작업 2개 중복 | `\WSL Auto Start (mysado)` · `\WSL2 Server AutoStart`. 하나가 옛 버전일 가능성. 정리 시 **어느 쪽이 실동작인지 확인 후** |
| 6 | `~/db-backups/` 백업 17개 누적 | 7/29~ 500~700KB씩. 최근 3~4개만 남기고 압축 보관. **N-1 자동화 붙일 때 함께** |
| 7 | 클라우드 사본 미완 | 노트북 사본은 함께 이동하므로 진짜 오프사이트가 아님 |
| 8 | `(updated_at, id)` 인덱스 | 51차 9-1-5 유지. 주문 규모 증가 시 |

### 7-2. 기존 이월 (51차에서 승계)

- 🔴 **NAS tun/SOCKS5 전환**(§6) / 전환 불가 시 Nginx allow 재검토 / `start-stop-status` 자가복구
- `grants` 축소 시 `tag:hub` 규칙 필수 / **API 키 전달 미완**(NAS 검증 성공 후)
- `orders` psql 수정 시 `updated_at = now()` 병기(51차 §7-3)
- `touchLastUsedAt` 실패 무로그 / dry-run 난수 소비 / `ApiRequest` 멱등성 테이블 / `error.details`
- 허브 API 나머지: 동기화 로그 → 재고 SET(L1) + 주문 수집(L2) **쌍으로 배포** / `StockMovement` 원장 / `snapshotAt`
- 미등록 허브 SKU 10건 / `inventory_source` HUB UPDATE 111건 / Admin CSV 일괄 재고 수정
- `admin_audit_log` 47차 정리 미포함 확인 / 웹훅 두 경로 미검증 / Prisma 트랜잭션 타임아웃 5초
- `product.status` DEFAULT `'SALE'` / `layer3b-write.js` V6
- `prod-066` 투명 / 42차 절단 18건 / `라이트블루` 3건 / prod-011 오타 / prod-154 `model_name`
- Layer 3b 잔여 / mysado.co.kr 301 / 소셜로그인 / `admin-guard.ts` 타입 캐스트
- Tailscale health check(`resolv.conf overwritten`, WSL 특성, 무해)

### 7-3. 🔴 토스 라이브 (기한 **2026-08-16 — 내일**)

| 항목 | 상태 |
|---|---|
| 라이브 계약 | **심사 중 (8/15 현재 미결)** |
| 8-2 조건부 재고 차감 / footer / 정책 | ✅ 완료 |
| 라이브 웹훅 실발신 수신 확인 | ⚠️ **심사 통과 후에만 검증 가능한 유일 항목**(45차부터 이월) |
| 키 교체 → `prisma generate` 별도 실행 → prod 재빌드 | 계약 승인 직후. `NEXT_PUBLIC_*` 빌드타임 |
| 폴백 cuid 제거 / `customerMobilePhone` 010 가드 / 채번 동시성 재시도 | 계약 승인 직후 |

**심사 통과 통보가 오면 8-3 묶음이 무엇보다 우선입니다.** 통보 시점에 서버가 내려가 있으면
웹훅 검증 창을 놓칩니다.

---

## 8. 새로 확립된 원칙

**⑴ 검사 기대값에 주석 포함 여부를 명시한다.** 0건 함정의 역방향 — 이번엔 패턴이 아니라
**기대값 쪽이 틀렸습니다**(§3-2).

**⑵ 한 응답에 실행 명령 블록은 하나만 둔다.** 이번 세션에서 답변 전문이 셸에 붙여넣어져
`event not found`·`Is a directory` 가 났습니다. 48·49차는 "블록 말미 문자" 문제였으나 이번은
**블록이 둘이라 복사 범위가 모호했던 것**입니다. 산문에서도 `!` 를 쓰지 않습니다
(붙여넣기 사고 시 산문에도 히스토리 확장이 걸립니다).
같은 세션에서 코드 블록 말미에 `</parameter>` 태그가 섞여 들어간 사고도 1건 있었습니다 —
**작성자 측 말미 확인 의무**(49차)의 재발입니다.

**⑶ 자동 복구는 층마다 따로 확인한다.** `pm2 save` → `pm2-chris` 유닛 → WSL 기동 → 로그온 →
전원. 어느 한 층이 끊기면 아래는 무의미합니다. `ssh` `disabled` 가 그 실례였습니다(§5-3).

**⑷ 신규 파일 위임은 코드를 값 수준으로 고정한다.** exact-match 앵커가 없으면 count 가드도
없습니다. 서술형 지시는 재량이 그대로 파일이 됩니다(§3).

**⑸ 미검증 범위를 커밋 메시지에 적는다.** 43차 §8-⑵를 `git log` 층에 적용. 나중에 해시를
만나는 사람이 검증 범위를 오독하지 않게 합니다.

---

## 9. 산출물

| 경로 | 내용 |
|---|---|
| `lib/api-v1/scopes.ts` · `orders.ts` | 신규 (커밋 `390fd19`) |
| `app/api/v1/orders/route.ts` · `[id]/route.ts` | 신규 (커밋 `390fd19`) |
| `outputs/작업지시서-52차-orders-읽기API.md` | Claude Code 지시서 (gitignore) |
| `~/db-backups/mysado_db-2026-08-15-pre-move.sql` | 649K, md5 `27b44feb…`, 노트북 사본 있음 |
| Windows | RDP 활성화 · 방화벽 3규칙 · `TermService` AUTO_START |
| WSL | `systemctl enable ssh` |

**prod 배포 없음** — 읽기 전용이고 허브가 아직 닿지 못하므로(NAS userspace) 4단계 검증 후가
순서상 맞습니다. dev·prod 2칸 차이는 의도된 상태입니다.

---

## 10. 53차 착수 후보

**A. 8-3 토스 라이브 전환 묶음** — 심사 통과 시 **최우선**. 기한 내일.
`prisma generate` 별도 선행 필수(50차 §6-4).

**B. 트랙 B 4단계** — 테스트 주문 2건 → 직렬화·커서·동률 검증 → prod 배포.
설계는 §4-4에 확정돼 있습니다. **43차 재고 차감 코드의 실데이터 재검증이 덤으로 따라옵니다.**

**C. NAS SOCKS5 지시서 1라운드 발행** — §6. 대표 일정에 묶인 비동기 작업이므로
**발행만 먼저** 해 두면 B와 대기 시간이 겹치지 않습니다.

> 권장: **A(통보 시) > C 발행 > B**.
> C의 1라운드는 관측만이라 5분이면 나가고, 답이 오는 동안 B를 진행할 수 있습니다.

# Phase 7 — 43차 핸드오프

**일자** 2026-08-04
**주제** 8-2 조건부 재고 차감 신설 · 문서 규약 정비
**커밋** `bb32776`(feat) → `a271169`(chore)
**배포** prod `bb32776` 반영 완료 (pm2 ↺ 34)

---

## 0. 세션 시작 프로토콜 (다음 세션은 여기서 시작)

```bash
pm2 ls                                                    # online, ↺ 34
curl -so /dev/null -w "%{http_code}\n" localhost:3000     # 200
cd ~/apps/mysado-shop      && git log --oneline -1         # a271169
cd ~/apps/mysado-shop-prod && git log --oneline -1         # bb32776 (chore 미반영 — 정상)
```

> prod가 한 커밋 뒤인 것은 의도된 상태입니다. `a271169`는 문서·설정 전용이라 런타임 영향이 없어
> 다음 기능 배포 때 함께 넘어갑니다. **41차처럼 "모르는 사이 벌어진 격차"가 아닙니다.**

DB 정합 상태:

```sql
-- prod-004 = 195, prod-017 = 98 이어야 함 (살아있는 PAID 주문 0005·0007과 일치)
SELECT id, stock_quantity FROM product WHERE id IN ('prod-004','prod-017') ORDER BY id;
```

---

## 1. 이번 세션의 핵심 발견 — "동시성 방어"가 아니라 "차감 신설"이었다

로드맵 8-2는 33차에 **"stock=1 상품의 동시 결제 시 음수 재고·이중 판매 위험"** 으로 기록돼 있었습니다.
착수 전 실측에서 전제가 뒤집혔습니다.

```
grep -rn "decrement\|increment" app/ lib/     →  0건
app/api/payment/confirm/route.ts (198줄)      →  stock 언급 0회
product 테이블 음수 재고                       →  0건 (PAID 3 + DONE 1 주문 이후에도)
```

| | 33차 기록 | 43차 실측 |
|---|---|---|
| 위험 | 동시 결제 시 음수 재고 | **모든 결제가 재고를 줄이지 않음** |
| 조건 | 동시성이 있을 때 | 동시성 없이도 무한 판매 |
| 성격 | 방어 추가 | **차감 신설** |

음수 재고가 0이었던 것은 방어가 잘 됐다는 뜻이 아니라 **한 번도 차감된 적이 없다**는 증거였습니다.
재고 1개 상품 7건, 2개 상품 9건이 실결제 개시 시 무제한 판매되는 상태였습니다.

**교훈**: 과거 핸드오프의 위험 기술은 그 자체로 검증된 사실이 아닙니다. 41차 §2가 경고한
"이월 문서의 미검증 전제"가 로드맵 층위에도 있었습니다. 착수 전 실측이 설계를 바꿨습니다.

---

## 2. 확정된 설계

### 2-1. 핵심 불변식

```
order.status === 'PAID'   ⟺   그 주문의 재고가 차감되었다
```

이것이 성립하면 **차감 여부를 기록하는 컬럼·플래그가 불필요**합니다. 그래서 마이그레이션 0건입니다.
유지 방법은 하나뿐 — **차감과 상태 전환을 항상 같은 트랜잭션에 두는 것.**

### 2-2. 경로별 정책

| 경로 | 상태 전이 | 차감/복원 | 근거 |
|---|---|---|---|
| confirm 정상 | `PENDING → PAID` | **차감** | 정상 경로 |
| confirm 멱등 재응답 | 이미 `PAID` | 없음 | 트랜잭션 미진입 (55행 조기 반환) |
| confirm 토스 승인 실패 | `→ FAILED` | 없음 | 결제 자체가 없음 |
| confirm 재고 부족 | `→ CANCELED` | 전량 롤백 | 승인된 결제를 자동 취소 |
| webhook DONE 보정 | `PENDING/FAILED → PAID` | **차감(부족 허용)** | 대상이 미차감 주문 |
| webhook CANCELED 동기화 | `→ CANCELED` | **`PAID`였을 때만 복원** | `PENDING`/`FAILED`는 차감된 적 없음 |
| cancel 라우트 | `PAID → CANCELED` | **복원** | `PAID`이므로 반드시 차감됨 |

**웹훅 보정은 차감을 해야 한다** — 설계 초기에 "이중 차감 위험"으로 의심했으나 반대였습니다.
보정 대상은 confirm 트랜잭션이 롤백된 미차감 주문이므로, 차감을 빼면 불변식이 깨집니다.

### 2-3. 원시함수를 하나로, 정책을 둘로

confirm과 웹훅의 요구가 정반대라 `tryDeductStock`을 **throw하지 않고 부족 행 목록을 반환**하는
형태로 두고 롤백 여부를 호출측이 결정하게 했습니다.

| | 부족을 만났을 때 |
|---|---|
| confirm | `throw` → 부분 차감까지 **전량 롤백** 후 결제 취소 |
| webhook DONE 보정 | 가능한 만큼 차감하고 나머지를 `console.error` + 로그 |

웹훅에서 throw하면 500 → 토스 재발송 → 같은 결과 반복 → 주문이 영구 `PENDING`으로 남습니다.
돈은 이미 받은 상태이므로 "부분 차감 + 기록"이 정답입니다.

### 2-4. 동시성 안전의 근거

```sql
UPDATE product SET stock_quantity = stock_quantity - n
WHERE id = ? AND stock_quantity >= n
```

PostgreSQL ReadCommitted에서 뒤에 온 트랜잭션은 행 잠금 대기 후 **`WHERE` 조건을 갱신된 값으로
재평가**합니다. 따라서 재고 1개에 두 결제가 동시에 오면 한 쪽만 `count = 1`이 됩니다.
**조회 후 JS 비교 후 차감 패턴으로는 이 보장을 얻을 수 없습니다.**

dev 로그에 `AND "stock_quantity" >= $4` 가 찍힌 것이 직접 증거입니다.

---

## 3. 변경 내역

```
lib/inventory.ts                    신규 113줄 — 재고를 쓰는 유일한 지점
app/api/payment/confirm/route.ts    배열형 → 대화형 트랜잭션, 부족 시 자동취소 블록
app/api/payment/cancel/route.ts     items 조회 + 복원
app/api/payment/webhook/route.ts    items 조회 + 보정 차감 + 조건부 복원
prisma/schema.prisma                무수정 — 마이그레이션 0건
```

`PAYMENT_LOG_TYPE`에 새 상수를 추가하지 않고 기존 4종 + `payload.reason` 조합으로 표현했습니다
(74행의 `AMOUNT_MISMATCH`와 같은 패턴).

- 재고 부족: `CONFIRM_FAIL` + `reason: "STOCK_SHORTAGE"` + `shortage` 배열
- 취소마저 실패: `CANCEL` + `reason: "STOCK_SHORTAGE_CANCEL_FAILED"` + `console.error`

---

## 4. dev 실검증 6/6 통과

| # | 시나리오 | 결과 |
|---|---|---|
| ① | 정상 차감 | `prod-004` 197 → 196 |
| ② | 재고 부족 | 409 + `CANCELED` + 재고 불변 + `shortage` 기록 |
| ③ | 멱등 | success 새로고침 시 재고·로그 불변 |
| ④ | 복원 | 196 → 197, 주문 `CANCELED` |
| ⑤ | 이중 복원 차단 | `alreadyCanceled: true`, 재고 불변 |
| ⑥ | **전량 롤백** | `prod-004` 196 **불변** (부분 차감 0) |
| + | 다건 정상 차감 | 2상품 동시 차감 (계획 외 수확) |

⑥의 dev 로그가 설계 전체를 보여줍니다.

```
BEGIN
UPDATE product ... WHERE id = $3 AND stock_quantity >= $4    ← prod-004 성공
UPDATE product ... WHERE id = $3 AND stock_quantity >= $4    ← prod-017 count 0
ROLLBACK                                                      ← 성공분까지 되돌림
[confirm] 재고 부족 → 결제 자동 취소 [{ productId: 'prod-017', quantity: 3 }]
409
```

`ROLLBACK`이 찍혔다는 것은 `StockShortageError`의 `instanceof` 판별이 실제로 작동했다는 뜻입니다
(`tsconfig` target 미지정 = ES5라 `Object.setPrototypeOf` 없이는 여기서 500이 났습니다).

**미검증**: 웹훅 두 경로. confirm DB 쓰기 실패를 인위적으로 만들어야 해 재현이 어렵고,
코드 리뷰로 갈음했습니다. → 이월 항목 4.

---

## 5. 잔여 위험 (수용, 문서화)

**⑴ 불변식이 깨지는 유일한 예외** — 재고 부족 + 토스 취소 API 실패가 동시에 발생하면
`PAID`인데 미차감인 주문이 생깁니다. 그 주문을 나중에 취소하면 차감되지 않은 재고가 복원됩니다.
발생 조건이 두 사고의 곱이고 `console.error` + 전용 `PaymentLog` 사유로 즉시 관측되므로
**수동 처리 대상**으로 둡니다. `PENDING`으로 남기면 고객 재시도로 이중 결제가 되므로
`PAID` 확정이 그나마 회복 가능한 상태입니다.

**⑵ Prisma 트랜잭션 타임아웃 5초** — 동일 상품에 극단적 동시 결제가 몰리면 `P2028`이 발생하고,
`StockShortageError`가 아니므로 재던져져 승인된 결제에 500이 나갑니다.
다만 웹훅 `DONE` 보정이 주문을 `PAID`로 끌어올리며 차감까지 수행하므로 **보정망이 존재**합니다.
현재 트래픽에서 발생 불가에 가까워 타임아웃 상향은 하지 않았습니다.

**⑶ 기존 `PAID` 주문의 미차감분** — 7/21·7/25 테스트 주문 3건(`prod-199`·`prod-081`·`prod-038`·`prod-003`)은
차감된 적이 없습니다. **이 주문들에 `cancel` API를 호출하면 유령 재고가 생깁니다.**
8-9(테스트 데이터 정리)까지 호출 금지. `DONE` 1건은 cancel이 `PAID`만 허용하므로 무해합니다.

---

## 6. 문서 규약 정비 (커밋 `a271169`)

### 6-1. 프로젝트 지침 교체

7/09 시점 내용(Phase 1, 상품 147개, "다음 작업: 상품DB 이전")이 한 달간 방치돼 있었습니다.
**상태를 빼고 불변 규약만 담는 형태로 전면 교체**했습니다. 숫자를 하나도 넣지 않아 다시 낡지 않습니다.

### 6-2. CLAUDE.md

`## 현재 단계` 절이 30차 시점에 고착돼 **네 군데가 사실과 반대**였습니다
(결제 라이브 "연기" → 실제로는 8/16 마감, 소셜로그인 "다음 작업" → 이연 등).
Claude Code가 매 세션 이 파일을 읽으므로 매번 잘못된 전제로 출발하던 상태였습니다.

절 자체를 삭제하고 "최신 핸드오프가 상태 정본"을 문서 상단에 명시했습니다.
추가 규약: `stock`↔`stock_quantity` 매핑, DateTime UTC, `locked:true` 규약,
`expectedCurrent` 가드, 검증 한계(⑥), 원장 재계산 원칙(⑦), `lib/inventory.ts` 경유.

### 6-3. settings.json — deny 구멍 4건

| # | 구멍 | 보완 |
|---|---|---|
| ① | `prisma db push`만 차단, **`db execute`·`db seed` 통과** | `Bash(npx prisma db:*)` |
| ② | `cd ../mysado-shop-prod`만 차단, 절대경로는 통과 | `Bash(*mysado-shop-prod*)` |
| ③ | `npm install` 무제한 → Prisma 버전고정 미강제 | install/ci/update/uninstall/yarn/pnpm |
| ④ | `.env` 차단이 cat/grep/head/tail 4종뿐 | sed/awk/less/more/strings 추가 |

①이 가장 심각했습니다 — `psql`을 막은 이유가 "DB 직접 조작 차단"인데
`npx prisma db execute --file`이 같은 일을 할 수 있었습니다.

추가로 **`node` 실행을 차단**했습니다. `node -e`와 `node scripts/*-write.js --apply`는
psql과 동등한 DB 쓰기 경로이며, 실제 워크플로에서 Claude Code가 `node`를 실행해야 했던 적이 없습니다.

**deny 실증 3/3 통과** — `prisma db execute` / prod 폴더 / `node` 모두 차단됐고,
우회 시도(python3, npx tsx)까지 스스로 거부했습니다.

부작용 1건: `Bash(*mysado-shop-prod*)`가 "세션 종료 전 dev/prod 커밋 대조" 절차를 막습니다.
규칙 완화 대신 **CLAUDE.md에 "Chris가 실행하고 결과만 전달"로 명시**했습니다.

---

## 7. 이월 항목

| # | 항목 | 비고 |
|---|---|---|
| 1 | **연락처 400 UX** — `scrollTo(top)` / `onBlur` 인라인 검증 / `autoComplete="tel-national"` | 이번 세션에서 실제 지연 발생. 브라우저 자동완성이 `+54…`를 채웠고 에러가 화면 최상단이라 미인지 |
| 2 | **재고 표시** — 장바구니에 "N개 남음"+막힘 사유, 상세는 사유만 | 상세는 ISR 60초라 숫자가 부정확. `app/cart/page.tsx:72`가 침묵 반환 중 |
| 3 | 연락처 정규식 복제 2곳 상수화 | `lib/orders.ts` · `lib/address-validation.ts` 동일 정규식 |
| 4 | 웹훅 두 경로 미검증 | 코드 리뷰로 갈음 |
| 5 | 라이브 전환 후 계좌이체 취소 시 `refundReceiveAccount` 요구 가능성 | 테스트 키에서는 불요구 확인 |
| 6 | 테스트 주문 정리 — `MYSADO-260804-0001·0002`(PENDING), `0005·0007`(PAID) | 8-9 |
| 7 | `app/api/mypage/addresses/*` raw SQL 3건 | 26차 배송지 CRUD. 사유 확인 필요 |
| 8 | Prisma 트랜잭션 타임아웃 5초 | §5-⑵ |
| 9 | `01_payment.md` 결제창 방식 기준 | 현 구현은 **결제위젯**. 상단 경고 후 repo 이전 |
| — | (이전 이월분 유지) `product.status` DEFAULT `'SALE'`, `layer3b-write.js` V6 전역 유일성 검사, prod-011 `로열핑/뱅` 오타, prod-154 `model_name`, `lasertTransparent` 관례, mysado.co.kr 301, 소셜로그인 | |

---

## 8. 새로 확립된 원칙

**⑴ 착수 전 실측이 설계를 바꾼다** — 과거 핸드오프의 위험 기술을 전제로 삼지 않습니다.
8-2는 실측 후 성격 자체가 달라졌습니다.

**⑵ 검증 한계를 명시한다** — 42차 write 스크립트는 dry-run으로 자기 검증이 가능했지만,
결제 라우트는 DB·네트워크 없이 검증 불가입니다. Claude Code는 정적 검사와 논리 대조까지가 한계이고,
**그 이상을 "검증했다"고 보고하지 않습니다.**

**⑶ 수동 원복은 "기준선 복귀"가 아니라 "원장 재계산"** — 이번 세션에서 두 번 틀렸습니다.
검증 중 실거래(`PAID` 주문)가 섞이면 시작값은 더 이상 정답이 아닙니다.
살아있는 `PAID` 주문의 수량 합을 빼야 정합값이 나옵니다.

**⑷ 규칙은 막히는 것을 봐야 신뢰한다** — deny 목록에 넣는 것과 실제로 차단되는 것은 별개입니다.
30차에 이어 이번에도 실증했고, ②처럼 "넣었지만 우회 가능"한 구멍이 실제로 있었습니다.

**⑸ 문서에 상태를 적으면 반드시 낡는다** — 프로젝트 지침(7/09)과 CLAUDE.md(7/26)가
같은 병으로 동시에 낡아 있었습니다. 상태는 최신 핸드오프 하나에만 둡니다.

---

## 9. 다음 세션 후보

**8-9 테스트 데이터 정리** — 이월 6번. `PAID` 주문 취소 시 재고 복원이 자동으로 걸리므로
§5-⑶(미차감 주문)과 함께 처리해야 합니다. 순서 설계 필요.

**7-3 게시 게이트** (review → published) — 로드맵 미착수 항목.

**결제 UX 묶음** — 이월 1·2·3. 셋 다 체크아웃/장바구니 영역이라 한 세션에 묶기 적합합니다.

**Layer 3b 커버리지 확장** — 219개 상품의 서술 tier가 비어 있습니다.

> **마감 있는 항목**: Toss Payments 라이브 계약 2026-08-16.
> 8-2 완료로 라이브 전 필수 기술 요건 중 가장 무거운 것이 해소됐습니다.

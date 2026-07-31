# Phase 7 36차 핸드오프 — Layer3b 대표 서술 반영 + 그룹 분할 + R4 단종 + 상태체계 설계

작성일: 2026-07-31 | 세션: 36차 | 이전: 35차(ProductGroup additive 반영 + 대표 5개 선정)

---

## 1. 36차 완료 사항

### 1-1. Layer3b 대표 서술 생성·반영 (핵심 성과)

**서술 tier가 처음으로 채워졌습니다.** 31차에 진단한 "이미지에 갇혀 크롤러가 못 읽던 텍스트"를 대표 4개에서 되살렸습니다.

- **생성 방식**: 경로 B(구독 비전, 대화 내 직접 추출). Chris가 배너 제거한 상품/썸네일 이미지 업로드 → 서술 tier(highlights·description·seoTitle·seoDescription) 직접 추출. API 키 부재(그린필드)로 서버 API 대신 채택.
- **DB 반영 11행 (draft→review)**:

| 대표 | 단위 | 상속 | confidence |
|---|---|---|---|
| prod-007 | group GP-FPF766HI(플립수트) | → 008·009·010·011·012 (5) | high |
| prod-001 | group GP-FPL335HI(워치독) | → 002·003 (2) | high |
| prod-066 | singleton (S26 AR필름) | 없음 | high |
| prod-172 | singleton (푸바오 키링) | 없음 | medium |
| prod-116 | (제외) | — | low → 단종 처리 |

- **모드 span 4종 전부 성공**: 그룹 생성(R1·R2)·수치 스펙(R3)·se-viewer 굿즈(R5)·이미지 부재 폴백(R4). 이 5개가 배치 127 확대의 골든 기준.
- **환각 차단 검증**: 사실 tier(compatibleModels·specs) **무접근** — write 입력에서 groundingUsed·newFactCandidates를 애초에 제외. apply 후 psql로 사실 tier 불변 확인(prod-007 옐로우·Z플립7, prod-001 워치3~8·블랙, prod-066 S26울트라·color NULL).
- **provenance**: 대표=`vision-claude-chat`, 상속=`inherited:<대표id>`. contentMeta 스프레드 머지로 기존 사실 tier provenance 보존.
- **highlights 컬럼 타입 = `text[]`** (jsonb 아님). 배치·프론트 렌더 시 `array_length` 사용.

### 1-2. GP-FPF766HI 그룹 분할 (35차 결함 교정)

**35차 파일럿이 병합 결함을 잡았습니다.** SKU 11자 프리픽스가 제품군 2종을 병합 → 분할.

| 그룹 | 멤버 | 대표 |
|---|---|---|
| GP-FPF766HI (플립수트 카드 케이스) | prod-007~012 (6) | prod-007 |
| GP-FPF766HI-VR (버라이어티 마그넷 케이스, 신규) | prod-127~136 (10) | prod-127 (VARIANT→PRIMARY 승격) |

- additive(INSERT 1 + UPDATE 10), 파괴 구문 0. 그룹 18→19, grouped 90 불변.
- 독립 psql 교차검증: 각 그룹 PRIMARY 유일, rep==PRIMARY.
- prod-007 서술이 FLIPSUIT 6에만 상속되도록 write 입력 범위 한정(VARIETY는 상속 안 받음).

### 1-3. R4 prod-116 단종·품절 확정

- 목표: `stock=0 / status=OUTOFSTOCK / isVisible=false`. 라이브 DB 이미 동일 → **no-op**(멱등 확인). apply 생략, 스크립트만 커밋(단종 의사결정 기록).
- 화이트리스트(TARGETS) 방식 — `--only`로도 타 상품 접근 불가.

### 1-4. 커밋 (3개, 관심사 분리)

- `18df93e fix(product-group)`: GP-FPF766HI 플립수트/버라이어티 분할
- `ab76723 feat(layer3b)`: 대표 4개 서술 write + 그룹 상속 (review 승격)
- `85e0100 chore(product)`: prod-116 단종·품절 확정 스크립트

### 1-5. 산출 파일

- `scripts/group-split-write.js` · `product-status-write.js` · `layer3b-write.js`
- `data/group-split입력-36차.json` · `data/layer3b-write입력-36차.json`
- (검수 트레일) `layer3b-대표5개-추출미리보기-2026-07-30.md` · `data/layer3b-대표5개-candidate-2026-07-30.json`

---

## 2. 현재 상태 (37차 시작 baseline)

```
pm2         mysado-shop  online  ↺26 (세션 중 재기동 없음)
prod        curl localhost:3000  200
git         main, 85e0100 (push 여부 확인)
DB 백업      ~/db-backups/mysado_db-2026-07-30-pre-36write.sql (525K)
상품         199 / 그룹 19
서술 tier    11행 review (대표4+상속7) / 나머지 draft
판매상태     SALE·is_active=true 146 / OUTOFSTOCK·is_active=false 53
```

**⚠ baseline 정정**: 이전 핸드오프의 "판매가능 197"은 실측과 불일치. **실제는 노출(SALE/active) 146 / 비노출(OUTOFSTOCK/inactive) 53**. 두 축(status·is_active) 완전 정렬(모순 조합 0). 197의 출처는 미상 — 정의 차이 또는 미반영 추정. 이후 146/53 기준.

---

## 3. 36차 판단·발견 기록

### 3-1. 위임 결과를 요약 아닌 원문으로 검증 (34차 원칙 8 재확인)
Claude Code가 제 지시서의 오기 2건을 스키마 원문으로 교정:
- Prisma 필드명: `stockQuantity`·`isActive`(오) → **`stock`(@map stock_quantity)·`isVisible`(@map is_active)**(정). products_v2.json snake_case에서 camelCase를 잘못 유추.
- content_status 현재값: raw(오) → **draft**(정, 34차가 이미 승격). draft→review로 동작.

### 3-2. Claude Code 추가 가드 (승인·계승)
- **선행조건 가드**: `unit=group:*`마다 실제 멤버 수 == 대표1+inheritTo n 검사 → STEP 순서 위반 자동 탐지(하드코딩 없이 일반화). 배치 확대에 재사용.
- **입력 오염 거부**: generated에 사실 tier 필드 섞이면 중단.
- **상태 write 화이트리스트**: TARGETS 밖 id는 --only로도 불가.

### 3-3. 검수 SQL 오기 (기록)
`highlights`를 jsonb로 오인해 `jsonb_array_length` 사용 → 실패. 실제 `text[]`라 `array_length(col,1)`. 컬럼 타입 확인 후 쿼리 작성 원칙.

---

## 4. 판매 상태 체계 개편 — 설계 확정 (37차 구현)

**결정**: status 단일 enum 일원화 + is_active 파생. **품절=노출**, **착수=37차(신규 상품 등록과 묶음)**.

### 4-1. 문제 (현 구조)
- status·is_active 2축의 곱 → 모순 조합 가능(SALE인데 숨김 등).
- 품절과 단종이 둘 다 OUTOFSTOCK/false로 뭉개짐 — 재입고 예정품과 진짜 단종품 미구분.
- 현재 53개는 대부분 "재고 보충되면 판매 가능"(= 품절, 단종 아님)인데 비노출 → 서술·SEO 자산 사장.

### 4-2. 목표 enum (단일 축 status)

| status | 노출 | 구매 | 전이 | 의미 |
|---|---|---|---|---|
| `ON_SALE` | ✅ | ✅ | 자동(재고>0) | 판매중 |
| `SOLD_OUT` | **✅**(품절뱃지) | ❌ | 자동(재고=0) | 품절(단종 아님) — 노출 유지 |
| `DISCONTINUED` | ❌ | ❌ | 수동잠금 | 단종(공급중단) |
| `SUSPENDED` | ❌ | ❌ | 수동잠금 | 판매 보류(재고 있으나 내외부 문제) |
| `DRAFT` | ❌ | ❌ | 수동 | 등록 준비중(신규 INSERT~검수 전) |
| `HIDDEN` | ❌ | ❌ | 수동 | 운영자 수동 숨김 |

- 파생 규칙: `isVisible = status IN (ON_SALE, SOLD_OUT)`. is_active는 status write 시 자동 세팅되는 종속 필드로 강등(방법 B, additive·비파괴).
- **자동전이(재고 기반) vs 수동잠금(DISCONTINUED·SUSPENDED) 구분이 핵심** — 단종/보류는 재고 들어와도 자동으로 안 풀림.
- (선택, 우선순위 낮음) `SOLD_OUT` 재입고 알림(Resend 활용, 수요 측정), `PREORDER`(신모델 출시 예약판매).

### 4-3. 37차 착수 시 사람 판단 1건
현재 53개(OUTOFSTOCK/false)를 `SOLD_OUT`(재입고 예정, 노출 복귀) / `DISCONTINUED`(진짜 단종, 비노출 유지)로 분류. **prod-116 = DISCONTINUED 확정.** 146개 = ON_SALE 일괄.
**분류 전까지 53개는 현 상태(비노출) 유지** — 성급히 노출 전환 금지.

### 4-4. 마이그레이션 경로 (expand-then-migrate)
1. expand: status enum 신규 값 확장(기존 SALE/OUTOFSTOCK 유지).
2. backfill: 53개 분류 + 146개 ON_SALE.
3. migrate: is_active를 status 파생으로 전환(렌더는 is_active 그대로 읽음).
4. 정리: 기존 문자열 → 신규 enum 리네임/매핑.
각 단계 backward-compatible(중간 상태도 사이트 정상).

---

## 5. 이월 잔여

| # | 항목 | 세션 |
|---|---|---|
| 36-1 | 사실 tier 후보 편입: prod-066 `specs.color='투명'`, prod-172 `specs.material='아크릴'` → 별도 locked write | 37차 |
| 36-2 | VARIETY 그룹(GP-FPF766HI-VR, 10) 서술 — 상세 이미지 확보 후 Layer3b 생성 (현재 raw) | 이미지 확보 후 |
| 36-3 | **판매 상태 체계 개편(§4)** — 37차 신규 상품 등록과 묶어서 | 37차 |
| 36-4 | 배치 127 확대 (골든 5개 기준) — 그룹 분할·prod-116 단종 반영 시 콘텐츠 단위 재계산 | 37차~ |
| 35-1 | variant_label 괄호잘림·대표 편향 정제 + prod-001 그룹 title '워치 8 7 6 5'→'워치3 이상' 정제 | 정제 세션 |
| 7-3 | 게시 게이트(review→published 승인 절차) | 37차 |
| 7-7 | mysado.co.kr → net 301 | 아무 세션 서두 |
| 34-* | 자사몰 자체 API | 39차~ (실주문 개시 후) |

---

## 6. 로드맵 순서 (35차 §5 갱신)

```
병행(즉시)  토스 라이브 계약 신청 (기한 8/16, 외부 심사)
36차 ✓      Layer3b 대표 서술 반영 + 그룹 분할 + R4 단종 + 상태체계 설계 — 완료
37차        게시 게이트(7-3) + 신규 상품 등록(INSERT 전용) + 판매상태 체계 개편(§4)
            + 사실tier 후보 편입(36-1) + Layer3a 처리
38차        토스 라이브 전환 + 조건부 재고 차감(+StockMovement·version) + 백업 + 알림
39차~       자사몰 자체 API — 트리거: 실주문 개시
배치         Layer3b 127 확대(36-4) — 골든 5개 기준, rate limit·비용 별도 설계
```

**37차 진입 조건**: 그룹 19·서술 11행 review 반영 완료(확인됨). 상태체계 설계 확정(§4, 품절 노출·37차 착수). 신규 상품 등록·게시 게이트·상태 enum이 한 세션에 묶임.

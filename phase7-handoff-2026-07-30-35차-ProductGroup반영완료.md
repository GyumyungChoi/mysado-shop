# Phase 7 35차 핸드오프 — ProductGroup additive 반영 완료 + 대표 5개 선정

작성일: 2026-07-30 | 세션: 35차 | 이전: 34차(Layer3a DB 반영 + 자사몰 자체 API 설계 v2)

---

## 1. 35차 완료 사항

### 1-1. ProductGroup additive 마이그레이션 (핵심 성과)

**199개 상품에 그룹 축이 처음으로 생겼습니다.** 근사 중복 PDP를 색상/디자인 변형으로 묶는 구조입니다.

| 검증 항목 | 결과 |
|---|---|
| 그룹 (`product_group`) | 18개, 전부 `content_status='raw'` |
| 그룹 편입 상품 | 90 (PRIMARY 18 / VARIANT 72) |
| 단독 상품 (`group_id IS NULL`) | 109 |
| 대표 정합 (representative_id == PRIMARY) | 불일치 0 |
| 그룹당 PRIMARY | 정확히 1 (예외 0) |
| 합계 | 90 + 109 = 199 ✓ |

그룹 크기 분포: 16색 폴드 1개, 6색 4개, 5색 2개, 4색 8개, 3색 2개, 2개 1개.

### 1-2. 스키마 (마이그레이션 `20260730103028_add_product_group`)

- 신설 `product_group`: `id(cuid)`, `group_key @unique`, `title`, `representative_id`(plain pointer, FK 아님), `category`, `content_status @default("raw")`, `created_at`, `updated_at`.
- `product` additive 3컬럼(전부 nullable): `group_id`(FK→product_group, `ON DELETE SET NULL`), `variant_label`, `group_role`. + `@@index([group_id])`.
- **파괴적 구문 0** — `--create-only` SQL 육안 검사 통과(ADD COLUMN/CREATE TABLE/CREATE INDEX/ADD FK만). 기존 199행 group_id=NULL로 무영향. expand-then-migrate의 expand 완결.
- dev·prod·공유DB 삼면 정합. prod는 `git pull` + `prisma generate`만(DB 공유라 재적용 불필요).

### 1-3. 그룹 배정 write (Claude Code 위임)

`scripts/productgroup-write.js` — 확정 JSON(`data/productgroup-write입력-35차.json`) **순수 적용**(파서 미포함). `--dry-run` 기본 / `--apply` 게이트, `--only <groupKey>` 단건, 그룹 단위 `$transaction`, id 부재 시 전체 중단, `group_key` UNIQUE 멱등(재실행 실증 완료: 단건 apply→재apply "재사용/무변경").

### 1-4. 대표 5개 선정 (36차 Layer3b 품질 기준)

추출 모드 span: R1 `prod-007`(16색 폴드, 디자인+색상) / R2 `prod-001`(3색 워치충전독, 순수 색상) / R3 `prod-066`(액정필름 AR, 수치 스펙) / R4 `prod-116`(SKU無 복합 케이스, 단독 폴백) / R5 `prod-172`(SKU無 최장 detail_html 4593자).

### 1-5. 커밋

- `265163d feat(product-group)`: 스키마 + additive 마이그레이션
- `92863ac feat(product-group)`: write 스크립트 + 확정 데이터

---

## 2. 현재 상태 (36차 시작 baseline)

```
pm2         mysado-shop  online  ↺26 (재기동 없음)
prod        curl localhost:3000  200
dev         3001 미기동
git         main, 92863ac (push 여부 확인)
DB 백업      ~/db-backups/mysado_db-2026-07-30-pre-productgroup.sql (524K)
상품         199 / content_status 전량 draft / 그룹 18(raw) / 판매가능 197
```

---

## 3. 35차 판단·오탐 처리 기록

### 3-1. 중복 SKU 오탐 2건 제외 (34차 원칙 ④ 실행)

SKU 공통접두 Union-Find가 **정상품 + 단순개봉미사용상품**을 색상 변형으로 오탐. §5-4에서 플래그된 `EF-RS942CBEG`·`EF-QS942CTEG`와 정확히 일치(부품번호 공유). baseName 공백이 2차 신호. → 4상품(prod-050/051/083/107) 단독화. prod-050/051은 34차에 이미 품절 처리된 개봉품.

### 3-2. groupKey = SKU 공통접두인 이유

상품명은 중간에 디자인 단어(리본·카카오프렌즈 등)가 끼어 이름 매칭 0건 실패. SKU 접두는 제조사 부여 안정 신호라 태그 스팸·이름 변형에 불변. "이름=표시용, SKU접두=구조용" 역할 분리(원칙 ②의 연장).

### 3-3. 대표=최소 id 유지, 라벨 정제는 36차로 이월

`representativeId`는 최소 id 자동 배정(②). 워치충전독 대표가 "리본 춘식 블랙"(캐릭터)이 되는 등 어색함이 있으나, 대표는 `representative_id` 1컬럼 UPDATE로 나중에 교체 가능. `variantLabel`도 일부 지저분(괄호 잘림 `GP-FPR640AM`, 40자 컷 `GP-TOX710SBA`/`GP-FPF766HI`). **`content_status='raw'`가 미정제 신호이며, 36차 Layer3b에서 title·라벨·대표를 서술 콘텐츠 검수와 함께 일괄 정제**(첫째 방향 확정).

---

## 4. 35차에서 얻은 원칙 (추가)

7. **format은 편집과 분리 커밋** — `prisma format`이 전 파일 정렬을 바꿔 diff가 부풀었음(119+/97−, 실질은 20줄). 앞으로 스키마 편집 → format을 별도 커밋으로 분리해 기능 diff를 깨끗이. 검증은 `git show <c> --ignore-all-space`로 실질 변경만 확인.
8. **완료 보고가 아니라 원문 로그를 본다** — Claude Code 요약은 정확했으나, dry-run 원문을 읽고서야 라벨 괄호 잘림·대표 편향을 발견. 위임 결과는 요약 신뢰 대신 원문 검증.
9. **스크립트 자체 가드 ≠ 검증** — write의 합계 가드(18/90)와 별개로 psql 독립 교차검증(대표 정합·PRIMARY 유일성). 가드는 스크립트의 자기주장, 검증은 DB의 사실.

---

## 5. 로드맵 순서 (34차 §4-5 유지)

```
병행(즉시)  토스 라이브 계약 신청 (기한 8/16, 외부 심사)
35차 ✓      대표 5개 + ProductGroup additive — 완료
36차        Layer 3b 비전 엔진 — 대표 5개 품질 기준 → 배치 확대
            + (그룹 단위) title·variantLabel·대표 정제, content_status 승격
37차        게시 게이트(7-3) + 신규 상품 등록(INSERT 전용) + Layer 3a 처리
38차        토스 라이브 전환 + 조건부 재고 차감(+StockMovement·version) + 백업 + 알림
39차~       자사몰 자체 API (34차 §5) — 트리거: 실주문 개시
```

**36차 진입 조건**: 그룹 18·상품 90 반영 완료(확인됨). 대표 5개(R1~R5) = Layer3b 첫 입력. Layer3b는 서술 tier(highlights·description·seoDescription)를 **그룹 단위로 1회 생성 → 멤버 상속**(사실 tier는 상속 안 함, 변형별 유지). 그룹화 덕에 콘텐츠 단위 199→127(18그룹+109단독).

---

## 6. 이월 잔여

| # | 항목 | 비고 |
|---|---|---|
| 35-1 | 그룹 title·variantLabel·대표 정제 | 36차 Layer3b와 함께(raw→검수) |
| 7-3 | 게시 전 검증 게이트 | 37차 |
| 7-7 | mysado.co.kr → net 301 | 30분 독립, 아무 세션 서두 |
| 34-* | 자사몰 자체 API(§5) | 39차~ (실주문 개시 후) |

---

## 7. 프론트 렌더링 (아직 없음 — 36차 이후 판단)

이번엔 스키마·데이터만. 그룹 필드를 **읽는 코드가 없어** 재빌드·재기동 불필요했음(런타임 불변). 색상선택 UI·canonical/variant SEO 구조는 그룹 콘텐츠가 정제된 뒤(36차~) 프론트 작업으로 착수. 그 전까지 PDP는 개별 상품으로 그대로 노출됨(회귀 없음).

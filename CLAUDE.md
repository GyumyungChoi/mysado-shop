# CLAUDE.md — mysado-shop 작업 지침

마이사도(mysado) 삼성 모바일 액세서리 커머스. Claude Code가 매 세션 자동으로 읽는 컨텍스트 파일.

> **이 문서에는 "현재 상태"를 적지 않는다.** 진행 상황·다음 작업·완료 목록은 최신 핸드오프가 정본이며,
> 여기에 적으면 반드시 낡아 잘못된 전제로 세션이 출발한다. 이 문서는 **변하지 않는 규약만** 담는다.

> **이 문서는 정본 규약과 짝이다.** 정본 규약은 세션 진행·검증·판정을 다루고 이 문서는 코드·데이터를
> 다룬다. 둘은 겹치지 않으므로 한쪽만 읽으면 사각지대가 생긴다(71차: `variant_label` 경고가 여기
> 있었는데 Chat 작성자가 못 읽어 배포 한 바퀴를 헛돌았다). **규약 개정은 두 문서를 함께 갱신한다.**

## 이 폴더의 정체 (★ 안전 핵심)
- 여기는 **dev 폴더** `~/apps/mysado-shop` (포트 3001). 개발·편집 전용.
- prod 폴더 `~/apps/mysado-shop-prod` (포트 3000, pm2)는 **절대 건드리지 않는다**. git pull 전용.
- dev와 prod는 **같은 PostgreSQL `mysado_db`를 공유한다**. 그래서 모든 DB 조작이 곧 운영 반영이다.

## 절대 하지 말 것 (settings.json에서 deny로 실제 차단됨)
- `prisma migrate reset` / DROP / TRUNCATE — 공유 DB라 복구 불가.
- `psql` / `prisma db execute` / `prisma db seed` — DB 직접 조작은 전부 Chris가 chat에서.
- `node` 실행 — `node -e`, `node scripts/*-write.js` 는 psql과 동등한 DB 쓰기 경로다.
  스크립트는 **작성만** 하고 실행은 Chris.
- `python` / `python3` / `pip` / `pip3` 실행 — node와 같은 이유(70차 deny 추가).
- `pm2` / `git push` / `git commit` / `npm install` / 배포 — 전부 Chris의 몫.
- 마이그레이션은 additive-only, `migrate dev` 금지. **실행은 전부 Chris**이며 절차는 정본 규약에 있다.
  (`--create-only`는 `migrate dev` 전용 플래그라 공유 DB에서 쓸 수 없다 — 49차 확인. 스키마 편집을
  지시받으면 `schema.prisma` 수정까지만 하고 마이그레이션 생성·적용은 보고 후 Chris에게 넘긴다.)
- 승인 프롬프트의 **"always allow" 변형은 절대 선택하지 않는다**(Chris 규칙).
- 🔴 **`scripts/product-status-write.js` 는 폐기 대상이며 실행·참조하지 않는다**(76차 확정).
  구값 `OUTOFSTOCK` 로 상태를 되돌리고 `stock: 0` 을 `lib/inventory.ts` 우회로 직접 쓴다.
  **역할이 끝난 일회성 스크립트는 그 시점의 어휘·전제로 굳어 있어, 나중에 실행하면
  현재 체계를 과거로 되돌린다.** 이 파일을 참고 코드로 삼지도 않는다.

## 기술 스택
- Next.js 14.2.35 (App Router, CommonJS, **src/ 없음**) / TypeScript / Node 22
- PostgreSQL 16 / Prisma 6.19.3 (**버전 고정 — 업그레이드 금지**)
- Better Auth 1.6.23 / **Tailwind CSS 3.4.1** / Toss Payments / Resend (이메일)
- 서버: BOSGAME P4 Ultra, Windows 11 + WSL2 Ubuntu 24.04 / Nginx / PM2 / Let's Encrypt
- 🔴 **`/api/v1` 은 Nginx ACL로 Tailscale(`100.64.0.0/10`)·localhost 에만 열려 있다**(86차 실측,
  합의된 접속 경로). 공인망 요청은 전부 403. 허브(주승시스템)는 tailnet 노드 `synjuseung`
  (`100.93.152.51`)에서 호출한다. **API 호출 흔적은 `api_client.last_used_at`(UTC)과
  `/var/log/nginx/mysado_access.log`(14일 보존)에 남는다** — `session.ipAddress` 는 못 쓴다.
  🔴 **`last_used_at` 은 마지막 1건만 남긴다**(87차). 횟수·경로·UA 는 Nginx 로그에만 있다.
  그리고 **그 로그도 공인망 웹 트래픽은 `172.25.32.1` 로 뭉갠다** — 출발지를 가릴 수 있는 것은
  tailnet 경로(`100.x` 가 그대로 찍힘)뿐이다.

## 현재 좌표
- **최신 핸드오프 문서가 상태의 정본이다.** 세션 시작 시 그 문서의 "세션 시작 프로토콜"을 먼저 실행.
- 핸드오프는 **이 저장소에 없다.** 별도 private 저장소 `~/apps/mysado-docs`(GyumyungChoi/mysado-docs)의
  `handoff/phase<N>/` 에 있으며, 그 폴더에서 가장 최근 파일이 정본이다. 지시서는 `worklog/` 에 있다.
- **`mysado-docs` 는 읽지 않는다**(deny 대상). 필요한 내용은 Chat이 지시서에 옮겨 적어 전달한다.
  과거 핸드오프를 직접 참조하면 낡은 전제가 현재 지시와 섞인다.
- 이 문서를 근거로 "다음 작업이 무엇인지" 추론하지 말 것. 지시서 또는 Chat에서 내려온다.

## 코딩 규칙
- TypeScript, `any` 금지. 주석·에러 메시지는 한국어.
- 함수형 컴포넌트 + Hooks. Tailwind 클래스(별도 CSS 최소화). 모바일 우선.
- 에러 처리 필수 — `lib/api-helpers.ts`의 `ApiError`/`toErrorResponse`/`getUserId` 사용.
- 편집 후 반드시 `npx tsc --noEmit` (VS Code TS 서버 캐시보다 이게 authoritative).
- 라우트 파일은 HTTP 메서드 핸들러만 export.
- `findUnique` 대신 `findUniqueOrThrow` — 조용한 실패 방지.
- 상태 리터럴은 `lib/product-status.ts` 상수·술어로만. 직접 문자열 비교 금지.
- **`group_role` 리터럴도 직접 비교 금지** — `lib/product-group.ts` 의 `GROUP_ROLE` 상수와
  `isPrimary`/`isVariant` 술어 경유(71차 신설). DB에 CHECK·enum이 없으므로 타입은 `string | null`
  로 두고 좁힘은 술어가 한다.
- 재고 읽기/쓰기는 `lib/inventory.ts` 경유. 라우트에서 `product.updateMany` 직접 호출 금지.
- **주문 결제 상태(`orders.status`) 전이는 조건부 `updateMany` 를 트랜잭션 첫 문장으로** 두고
  `count === 1` 일 때만 재고·로그·장바구니를 쓴다(97차 #104). 상세는 「토스 결제 경로」절.
- 배송비 산출은 `lib/delivery-fee.ts` 의 `calcDeliveryFee` 경유. 화면(`lib/cart.ts`)·결제
  (`lib/orders.ts`)가 같은 값을 내야 하므로 직접 `Math.max`·`reduce` 금지(59차). MAX 규칙 = 구매 가능 항목 중 가장 비싼 배송비 1건만 부과.

## gotcha (함정)

### 타입 층 구조 (71차 명문화)
- **`types/product.ts` 의 `Product` 는 전량 snake_case**이고, **`lib/products.ts:7` 의 `toProduct`
  가 Prisma camelCase → snake_case 어댑터**다(파일 주석에 "페이지/컴포넌트 코드를 바꾸지 않기
  위한 어댑터"로 명시).
- 따라서 **필드를 추가할 때는 `Product` 쪽에 snake_case로** 넣고 `toProduct` 에 매핑 줄을 더한다.
  Prisma 이름을 그대로 가져오면 그 파일에서 유일하게 camelCase인 필드가 생긴다.
- `ProductRow` 는 선언된 타입이 아니라 `import type { Product as ProductRow } from "@prisma/client"`
  별칭이다. grep으로 선언을 찾으면 0건이 나오지만 **없는 것이 아니다.**

### 컬럼명
- **컬럼 명명 규칙에 예측 가능한 패턴이 없다.** 테이블 단위로 갈리지 않고, 같은 테이블 안에 섞인다.
  - `user`: 코어 필드 camelCase(`emailVerified`·`createdAt`·`updatedAt`)
    + 프로젝트 추가 필드 snake_case(`phone_number`·`agreed_at`·`marketing_agreed`·`deleted_at`)
  - FK도 갈린다: `account`·`session`·**`product_view_log`·`search_log`** 는 `"userId"`(camelCase),
    `address`·`cart_item`·`orders` 는 `user_id`. **프로젝트 테이블이라고 snake_case가 아니다.**
  - **일반 컬럼도 갈린다**: `search_log`는 `"resultCount"`(camelCase, 47차 실증).
    `product_view_log`의 일반 컬럼은 미확인.
- → **컬럼명은 어떤 경우에도 추측하지 말고 `\d "테이블명"` 으로 먼저 확인한다.**
  쌍따옴표 필요 여부도 그 출력으로 판단. 에러 시 psql HINT가 올바른 이름을 제시한다.
- Prisma 필드명 ≠ DB 컬럼명: `phoneNumber`↔`phone_number`, `deletedAt`↔`deleted_at`,
  product는 `stock`↔`stock_quantity`, `isVisible`↔`is_active`,
  `inventorySource`↔`inventory_source`(49차 신설),
  **`groupId`↔`group_id`, `variantLabel`↔`variant_label`, `groupRole`↔`group_role`**(71차 실측,
  `schema.prisma` 157~159행),
  **`stockUpdatedAt`↔`stock_updated_at`**(76차 신설, 테이블 42번째 컬럼).
  (`stockQuantity`·`isActive`는 **존재하지 않는 이름**) — 매핑은 `schema.prisma`의 `@map`이 정본.
- `Order`는 테이블 `"orders"`(SQL 예약어). 테이블명 `user`도 예약어라 쌍따옴표 필요.
- 테이블 목록(추가될 수 있음, 정본은 '\dt' 출력): user, orders, session, account, address, cart_item, order_item, product,
  product_group, payment_log, product_view_log, search_log, verification, admin_audit_log, api_client.

### ProductGroup 묶음 층 (71차 구현)
- `product` 의 3컬럼: `group_id`(FK→`product_group`, **ON DELETE SET NULL**, 인덱스)·
  `group_role`(`PRIMARY`|`VARIANT`, **CHECK·enum 없음**)·`variant_label`.
- `product_group` 은 **나가는 FK가 0개**이고 `representative_id` 는 **plain pointer(FK 아님)**.
  정본 경로는 `group_role` 쪽이다.
- 읽기는 `lib/products.ts` 의 **`getGroupSiblings(groupId)`** — `isVisible: true` + `groupId` 일치,
  `sortOrder asc`, **현재 상품 포함 전량**(`excludeId` 없음), `take` 없음.
- **`getRelatedProducts`(카테고리 기준)와 병존**한다. 다른 물음에 답하므로 대체하지 않는다.
- `group_id` NULL이 과반(118/228)이다. 조회 전에 null을 검사해 쿼리를 발행하지 않는다.
- **`product_group.content_status` 와 `product.content_status` 는 동명이의.** 문서·주석에
  적을 때는 테이블명을 병기한다.

### 노출 판정과 게시 상태 (75차 실측)
- **화면·사이트맵 노출 판정은 `is_active`(Prisma `isVisible`) 단독이다**(75차 Chris 확정).
  `app/sitemap.ts` 가 `isVisible: true` 로만 거르며, 근거는 `getProductById()` 가
  `!isVisible` 이면 null(→404)을 반환한다는 점이다. 이 기준을 벗어나면 사이트맵에
  404 URL이 실린다.
- `is_active` 는 독립 축이 아니라 **`status` 의 파생값**이다. `lib/product-status.ts` 의
  `deriveIsVisible(status)` 가 `[ON_SALE, SOLD_OUT]` 만 true 로 본다.
  **status 를 쓰는 코드는 `is_active` 를 하드코딩하지 말고 이 함수 결과를 쓴다.**
- **`product.content_status` 는 노출을 막지 않는다**(75차 실측). `draft` 인 상품 176건이
  노출 중이고 사이트맵에도 실려 있다. `app`·`lib`·`components` 전체에서 이 컬럼을 읽는
  코드가 **0건**이며(`prisma/schema.prisma` 선언만 존재), 게시 게이트는 아직 없다.
  이 컬럼으로 노출을 판정하는 코드를 새로 쓰기 전에 설계를 먼저 확정한다.
- 75차 실측 분포(228행): `is_active=t` **218**(ON_SALE 174 / SOLD_OUT 44) ·
  `is_active=f` **10**(전부 DISCONTINUED). `content_status` = `draft` 186 · `review` 42 ·
  **`published` 0**. 컬럼 DEFAULT 는 `'raw'` 인데 실값 `raw` 는 0건인 고아 기본값이다.

### 재고 쓰기 주체 (`product.inventory_source`, 49차 신설 · 73차 복원)
- 값은 `HUB` 또는 `MANUAL` 두 가지. **기본값 `MANUAL`**(안전 방향 — 신규 상품이 실수로 허브
  관리로 분류돼 재고가 덮이지 않도록).
- `HUB` = 통합관리 프로그램(주승시스템)이 주기적으로 SET 하는 행.
- `MANUAL` = Admin 수기·CSV 업로드로 관리하는 행.
- 🔴 **"Admin 업로드 차단"·"API SET 400 거부"는 현재 동작이 아니라 S-3 요구사항이다**(77차 실측).
  `app`·`lib`·`components`·`scripts`·`prisma` 전 디렉터리에서 `inventorySource` 배선이 **0건**이고,
  마이그레이션 1줄과 `schema.prisma` 선언 1줄이 전부다. 별칭·헬퍼 경유 경로도 없다.
  **이원화는 데이터 분류 + 운영 약속이며 코드 게이트가 아니다.** 재고를 쓰는 코드를 새로 쓸 때
  "어딘가 막아주고 있겠지"로 읽지 말 것 — 막는 코드는 아직 없다.
- 교차 쓰기는 어느 방향도 허용하지 않는다. **재고를 바꾸는 코드를 새로 쓸 때 이 컬럼을
  검사하지 않으면 두 주체가 같은 행을 덮는다.** 검사 지점은 `lib/inventory.ts` 의
  `tryDeductStock` 과 `restoreStock` 두 함수다(76차 실측 — 그 전까지 "경유 규칙과 같은 자리"
  로만 적혔 있어 어느 함수인지 코드를 다시 읽어야 했다).
- 허브 SKU 매칭의 정준 키는 `regexp_replace(sku, 'KR$', '')` — 한국향 `KR` 접미는 비교 시점에만
  제거하고 **`sku` 원본은 고치지 않는다**(재임포트 회귀 방지, 48차).
- **허브에만 있고 우리에 없는 품목코드는 우리 쪽 처리 대상이 아니다**(73차 확정).
  대응하는 `product` 행이 없으므로 `status` 변경(단종 등)의 대상이 될 수 없고, 어떤 쿼리로도
  나오지 않는다. 방침은 **그 모델의 주문 수집·재고 갱신이 필요해지는 시점에 주승시스템이
  신규 품목코드를 등록**하는 것이다. "미매칭 N건을 단종 처리"라는 지시를 받으면
  대상 0건임을 보고하고 멈춘다.
- 재고의 3층: 이카운트 ERP(일별 확정 원장) → 통합 프로그램(확정 가용재고 산출) →
  판매 채널(SET 수신). **우리는 판매 층이며 원장을 갖지 않는다** — 우리 쪽에 둘 것은 원장이
  아니라 동기화 로그(`requestId`·`snapshotAt`·before/after)다(48차).
- **재고를 바꾸면 `stock_updated_at` 을 함께 갱신한다**(76차 신설). `tryDeductStock`·
  `restoreStock` 두 함수 진입 시 `new Date()` 를 **한 번만** 잡아 같은 트랜잭션의 모든 줄이
  공유한다. 줄마다 새로 잡으면 한 주문 안에서 시각이 갈린다.
  `updatedAt` 은 `@updatedAt` 이라 어느 필드가 바뀌어도 갱신되므로 재고 시각의 근거가 될 수 없다.
  **NULL 은 "재고가 없다"가 아니라 "우리 쪽에서 관측된 재고 변동이 없다"** 는 뜻이다
  (백필하지 않았으므로 신설 시점 228행 전량 NULL). 외부 사양서에 이 의미를 명시한다.
  🟢 **96차에 두 함수 모두 실증됐다**(이월 #38 해소). 라이브 결제 한 묶음에서 `prod-171` 이
  승인 시각 `2026-09-22 07:41:11.832`(UTC, 재고 5→4) · 취소 시각 `07:49:13.887`(4→5)를 받았다.
  **NULL 이 아닌 행이 존재하므로 배선은 성립이며**, 이제 이 컬럼은 "안 도는 배선"이 아니라
  **"실제로 도는 배선"** 으로 읽는다.
- **인증 주체는 두 경로이며 섞어 쓰지 않는다**(76차 Chris 확정).
  - **경로 A(확정)** — 허브 프로그램이 쓴다. 인증은 **`api_client` Bearer + scope**,
    대상은 `inventory_source='HUB'` 행. `hub-jusung` 의 현재 scope는
    **`{orders:read, products:read}`** 이며(79차 부여), 남은 것은 계정 신설이 아니라
    **`inventory:write` scope 한 줄**이다.
  - **경로 B** — 사람이 화면에서 쓴다. 인증은 Better Auth 로그인 + `user.role`,
    대상은 `MANUAL` 행. **`HUB` 행에는 적용되지 않는다** — 허브가 다음 SET 때 덮어써서
    사람이 넣은 값이 조용히 사라진다.
  - 프로그램이 사람 계정으로 로그인하는 설계는 채택하지 않는다. 세션 만료·비밀번호 변경이
    장애 요인이 되고 권한을 좁히거나 회수할 수 없다.
  - **`inventory:write`(S-3)는 `GET /api/v1/products`(S-2)가 있어야 연다.**
    재고 쓰기만 먼저 열면 허브가 무엇을 얼마로 세팅할지 모르는 채 권한만 갖는다.
    🟢 **S-2는 79차에 배포·개통됐으므로 이 선행조건은 해소됐다.** 남은 선행조건은 위의
    **배선 0건**이며, S-3에서 400 거부·admin 차단을 신설해야 한다.
    🟢 **87차 — S-1·S-2 둘 다 파트너가 실제로 호출 중이다**(S-2 9/14 · S-1 9/16,
    UA `JuseungSystem/1.0`). 파트너는 주문 5건을 받고 "재고 변환 규격이 자사 지시서에 없다"며
    스스로 멈췄고, S-3 설계 질문 3문항이 `mysado-docs/spec/mysado-hub-재고SET-설계질문.md` 로
    발행됐다. **재고 SET 대상은 `HUB` 112건**(9/2 발행 규격서의 111은 `prod-108` 전환 전 값).
    ⚠️ `L1`·`L2` 라벨은 77차에 폐기됐다 — **S-1**(주문 수집) · **S-2**(상품 목록) ·
    **S-3**(재고 SET)으로만 부른다.

### 토스 결제 경로 (96차 실증 · 97차 경합 해소 · 웹훅 개통)

- 🎉 **96차에 라이브 결제가 처음 관통했다** — `MYSADO-260922-0005` · 카드 4,500원 ·
  `PAID` → `CANCELED` · 재고 5→4→5 · 카드사 승인/취소 양건 확인.
- 🔴 **MID를 정하는 것은 키가 아니라 상점관리자의 「결제 UI 설정」이다.**
  우리가 쓰는 **주문서형·결제창형 연동 키**(`NEXT_PUBLIC_TOSS_CLIENT_KEY` = `live_gck_` /
  `TOSS_SECRET_KEY` = `live_gsk_`)는 **계정 단위**라 MID 선택이 없다. MID는 결제 UI의
  *이용서비스*에 연결된다(토스 문서: *"결제서비스와 MID는 1:1 관계로 생성돼요"*).
  92~95차의 승인 거절(`NOT_AVAILABLE_PAYMENT_BY_MERCHANT`)은 **계약된 `mysadokg25` 가 아니라
  미계약 `mysadord3v` 로 결제가 나가고 있었기 때문**이며, 어드민에서 MID를 바꾸자
  **코드 0 · 키 0 · 재빌드 0으로** 관통했다.
- **상점아이디(MID) = `mysadokg25` 하나뿐**이다. `mysadord3v`·`mysadon3ar` 은 미계약 상점.
- **결제 UI는 `variantKey: "DEFAULT"`**(`app/checkout/page.tsx:217`). 같은 파일 `:219` 의
  `AGREEMENT` 는 **약관 UI**이고 MID와 무관하다. 🔴 **새 UI를 만들면 새 `variantKey` 가 생겨
  코드 변경·재빌드가 따라온다** — 기존 `DEFAULT` 를 편집한다.
- 🔵 **API 개별 연동 키(`live_ck_`/`live_sk_`)는 쓰지 않는다** — 결제창(구버전)·브랜드페이용.
- **실값 어휘** — `orders.status` = `PAID`·`CANCELED`·`FAILED`·`PENDING` ·
  `payment_log.type` = `CONFIRM_SUCCESS`·`CONFIRM_FAIL`·`CANCEL`·`WEBHOOK` ·
  토스 `status` = `DONE`·`CANCELED`.
- 🔴 **실패한 승인의 `payment_log.payload` 에는 `mId` 가 없다.** MID를 볼 곳은 성공 로그이거나
  위젯의 `v1/log` 요청 payload 다.
- 🟢 **승인 경로는 멱등하다** — **순서대로** 들어온 재요청은 `confirm/route.ts:68` 이
  `status === "PAID"` 로 조기 반환하고 `:72` 가 `PENDING` 아닌 주문에 409를 낸다(96차 16:42:48
  재요청 200, 변화 0). 🔴 **동시에** 들어온 요청은 이 검사를 둘 다 통과할 수 있다 — 막는 것은 아래의
  조건부 전이다.
- 🔴 **결제 상태 전이 규칙**(97차 #104 · `5f41b27`) — `orders.status` 를 바꾸는 코드는
  **트랜잭션 첫 문장**을 `updateMany({ where: { id, status: <기대 상태> } })` 로 두고 **`count === 1` 일
  때만** 재고 차감·복원 / `payment_log` / 장바구니를 쓴다. **트랜잭션 밖에서 읽은 상태로 판정하지
  않는다** — PostgreSQL READ COMMITTED가 잠금 해제 뒤 WHERE를 갱신된 행으로 다시 평가하므로
  동시 요청 중 한 쪽만 1건이 된다. **0건 분기는 `[payment-race]` 로그**를 남긴다.
  - confirm — 승인 성공 `{PENDING, FAILED}`→PAID(0건이면 상태를 다시 읽어 PAID면 alreadyPaid,
    아니면 409) · 승인 실패 `{PENDING}`→FAILED(로그는 항상) · 재고 부족 자동취소
    `{PENDING, FAILED}`→CANCELED · 취소 실패 `{PENDING, FAILED}`→PAID(재고 미차감, 수동 개입)
  - cancel — `{PAID}`→CANCELED(0건이면 복원·로그 없이 `alreadyCanceled: true`)
  - webhook — DONE `{PENDING, FAILED}`→PAID(0건이면 차감 생략) · CANCELED ① `{PAID}`→CANCELED
    + 복원 ② `{PENDING, FAILED}`→CANCELED · **둘 다 0건이고 현재가 CANCELED가 아니면 500**으로
    토스 재전송을 받아 다음 수신에서 수렴시킨다(①과 ② 사이에 PENDING→PAID가 끼는 창)
  - 🔴 **토스 멱등키는 동시 요청만 막는다** — 앞 요청이 처리 중이면 409
    `IDEMPOTENT_REQUEST_PROCESSING`(97차 라이브 실측), 끝난 뒤면 **첫 응답을 재생**해 둘 다 성공으로
    진행한다(토스 문서). confirm 은 이 409를 실패로 쓰지 않고 `code: "PAYMENT_PROCESSING"` 409로 응답하며,
    성공 페이지(`app/payment/success/page.tsx`)가 「진행 중」 화면과 「결과 다시 확인」(새로고침)을 보인다.
    🟡 cancel 은 아직 이 409를 `CANCEL` 실패 로그로 남기고 토스 원문 메시지를 그대로 낸다(이월 후보).
  - 🔵 0건 뒤 재조회는 `findUnique` + `current?.status` 로 null을 명시적으로 다룬다 — 「코딩 규칙」의
    `findUniqueOrThrow` 가 막으려는 "조용한 실패"가 아니다.
- 🟢 **토스 웹훅은 97차에 등록·개통됐다**(2026-09-23 **16:29** KST · 라이브 `mysadokg25` ·
  이벤트 **`PAYMENT_STATUS_CHANGED` 만** · URL `https://mysado.net/api/payment/webhook`).
  운영 수신 첫 2건(`DONE`·`CANCELED`) 200 · 이중 처리 0 · UA `tosspayments` · 우리 커밋 뒤 약 0.25초
  도착 · **결제 취소에도 이 이벤트가 온다**.
  - 이 라우트는 페이로드를 믿지 않고 `getTossPayment` 로 **역검증**한 뒤 그 결과로만 쓴다(`:50`).
    결제 이벤트에는 **서명이 없다**(토스 문서: 서명은 `payout.changed`·`seller.changed` 뿐).
  - 역할은 둘이다 — ① confirm 이 토스 승인 뒤 DB 반영에 실패한 건의 보정(PAID + 차감)
    ② **토스 콘솔에서 직접 취소한 결제**의 동기화(CANCELED + 복원).
  - 토스는 **10초 안 200** 이 아니면 1·4·16·64·256·1024·4096분 간격으로 최대 7회 다시 보낸다 —
    DB 장애에 500을 주는 것이 곧 보정 수단이다.
  - `payment_log.payload` 는 `{ webhook: 원문, verified: 조회 결과 }` 구조다. 결제 1건당 `WEBHOOK`
    행이 승인·취소 각 1개씩 늘 수 있다.
  - 🟡 웹훅이 confirm 보다 먼저 PAID로 전이하면 confirm 은 0건 분기로 빠져 **장바구니 정리·확인
    메일이 생략**된다(기존 웹훅 보정 경로와 같은 성질. 97차 관측상 웹훅은 약 0.25초 뒤에 와서 드묾).
  - ⚠️ *"웹훅이 없으면 창을 닫은 주문이 PENDING 에 남는다"* 는 **거짓**이다 — 토스 문서도
    *"구매자가 결제창을 닫으면 결제 상태가 바뀌지 않기 때문에 웹훅도 전송되지 않습니다"*(96차 작성자
    오류 서른두 번째).
  - 📌 웹훅 설정은 상점관리자가 아니라 **개발자센터**(`developers.tosspayments.com/my/webhooks`)에 있다.
- 🔴 **가상계좌를 켜는 날의 선행조건**(97차) — confirm 은 승인이 `ok` 면 결제 상태와 무관하게 PAID로
  전이한다. 가상계좌는 승인 응답이 `WAITING_FOR_DEPOSIT` 이라 켜면 **입금 전 PAID + 차감 + 완료
  메일**이 나간다. 켜기 전에 confirm 의 상태 분기와 `DEPOSIT_CALLBACK` 구독을 먼저 만든다.
  97차 결제수단은 계좌이체·카드·N pay·카카오페이·토스페이이며 가상계좌는 없다.

### 데이터
- 🔴 **"DB write 0"은 "우리가 한 write 0"이다**(89차 ⓔ). 파트너(주승시스템)가
  `GET /api/v1/orders?limit=10` 을 **5분 주기·24시간** 호출하고 있어 `api_client.last_used_at` 이
  **하루 288회** Prisma로 갱신된다. dump 크기가 안 변하는 것은 행이 안 늘고 타임스탬프 길이가
  고정이기 때문이지 내용이 같아서가 아니다.
- 🔵 **`/api/v1` rate limit = 60회/분 · `api_client.id` 별 인메모리 고정 윈도**
  (89차 실측 `lib/api-v1/rate-limit.ts`). 초과 시 **429 + `Retry-After`**. 적용 라우트는 4개
  (`ping`·`products`·`orders`·`orders/[id]`)이고 순서는 전부 **인증 → rate limit → 처리**다
  (미인증 요청이 카운터를 오염시키면 안 되므로). 파트너 사용률은 분당 0.2회(0.33%)라
  주기 설계에서 rate limit은 제약이 아니다. 재기동하면 카운터는 0으로 초기화된다.
- `NULL || jsonb` 는 조용히 NULL을 반환한다. 읽기 → JS 병합 → 전체 쓰기.
- Prisma `DateTime`은 **UTC로 저장**된다. KST 벽시계 값으로 필터하면 어긋난다.
- 🔴 **`@updatedAt` 은 Prisma 쓰기에서만 갱신된다**(79차 실측). `psql` 로 직접 UPDATE한 행은
  `updated_at` 이 움직이지 않아 **허브의 증분 수집(`updatedAfter`)에 영원히 잡히지 않는다**
  (`prod-108` 이 9/7 수정 후에도 `2026-08-01 07:32:03.578` 그대로였다).
  `product` 를 psql로 UPDATE할 때는 `updated_at` 을 같은 SQL에서 함께 갱신하되,
  UTC 저장이므로 **`(now() AT TIME ZONE 'UTC')`** 로 쓴다 — `now()` 를 그대로 넣으면
  9시간 어긋난다(**서버 `TimeZone` = `Asia/Seoul`**, 84차 확정).
- 🔴 **DB DEFAULT `CURRENT_TIMESTAMP` 인 `created_at` 은 KST로 박힌다 — 단, INSERT가 그 컬럼을
  생략할 때만**(84차 확정 · 86차 조건 확정). `product`·`cart_item` 등의 `created_at` 이 그 DEFAULT를
  갖는다. Prisma 경로(`@default(now())`)는 값을 직접 넣어 UTC이므로 걸리지 않는다
  (86차: `cart_item` 의 `created_at`·`updated_at` 이 밀리초까지 동일 → 둘 다 Prisma UTC).
  psql·적재기로 INSERT할 때는 `created_at`·`updated_at`·`registered_at`·`channel_modified_at` 을
  **전부 `(now() AT TIME ZONE 'UTC')` 로 명시**한다. 시각을 읽을 때는 **어느 경로가 쓴 행인지**를 먼저 본다.
- **`product.name` 이 변형 식별의 정본이다.** `variant_label` 은 색상명이 아니라
  **상품명 전체에 가까운 문자열**이다(71차 실측: prod-127~136 10건이 `name` 에서 기기 접두만
  빠진 형태). 화면에 그대로 쓰면 같은 묶음 안에서 앞부분이 전부 같아 변별이 되지 않으므로,
  표시할 때는 묶음 내 공통 접두·접미를 런타임에 깎는다
  (`components/products/detail/VariantSelector.tsx` 의 `commonAffix`/`trimAffix`).
  **DB 값은 고치지 않는다** — 원본이 스마트스토어 계열이라 재임포트 시 회귀 가능하고 정책 미정.
  🔴 **40자 절단은 84차 전수 확인으로 확정됐다** — `max(length)` = 40, ≥38자 12행 중 **3건이 명백한
  절단**(`prod-010`·`prod-011`·`prod-142`, 전부 71차 관측 대역 `prod-127~136` 밖 → 71차 "미확인
  강등"은 **모집단 문제**였다). **우리 코드는 자르지 않는다**(`slice(0,40)` 류 0건, `truncate` 헬퍼는
  `…` 를 붙이는데 DB 값에는 없음). 절단 지점은 원천(스마트스토어 계열) 쪽으로 **소거 추정**이며
  미확인. 등록 파이프라인은 같은 자리를 지나지 않으므로 신규 등록분에는 걸리지 않는다.
- **`Order.totalAmount`(상품합+배송비, 최종 결제금액) ≠ `CartView.totalAmount`(상품금액 합계만).**
  화면에 찍는 값은 `CartView.payableAmount` 다(59차). 이름이 같아 혼동하기 쉽다.
- `contentMeta.<field>.locked === true` 인 필드는 **전용 정정 스크립트로만** 덮는다.
  `locked`를 해제하지 않고, `corrections` 배열에 `previousValue`·`previousSource`·`reason`을 누적한다.
  `source`가 `name-rule`인 값은 규칙 산출물이며 사람 검증값이 아니다.
- FK `ON DELETE CASCADE`는 **자식 삭제 건수를 출력하지 않는다.** 삭제 전 자식 행 수를 세어 두지
  않으면 "무엇이 사라졌는지 모르는 삭제"가 된다. `orders` 삭제 시 `order_item`·`payment_log`가,
  `user` 삭제 시 `account`·`session`·`address`·`cart_item`이 동반 삭제된다(47차 실증).
  **SET NULL 계열은 더 조용하다** — `product` 삭제 → `order_item.product_id`,
  `product_group` 삭제 → `product.group_id` 가 NULL이 되고 아무 것도 출력되지 않는다.
  **두 테이블 모두 행 하드 삭제 금지**(정본 규약).
- **`product` 삭제는 `cart_item` 을 CASCADE 로 지운다**(75차 `\d product` 실측).
  `cart_item_product_id_fkey` 만 `ON DELETE CASCADE` 이고 `order_item`·`product_view_log` 는
  SET NULL 이다. `cart_item` 을 `user` 삭제의 자식으로만 기억하면 건수 없이 사라진다.
- **미결제 주문은 장바구니를 비우지 않는다**(79차 실측). `MYSADO-260902-0001`(PENDING) 생성
  30초 전에 담긴 `cart_item` 이 주문 뒤에도 그대로 남아 있었다. **주문 생성과 장바구니
  비우기가 묶여 있다고 가정하지 말 것** — 코드 경로는 미확인이며, PENDING 만료 정책도
  미구현이라 누적된다(8/24 · 9/2 · 9/10 · **9/15 네 건**, 87차 실측).
  🔵 9/15 건(`MYSADO-260915-0001`)은 **토스 심사 측이 웹 체크아웃으로 넣은 시험 주문**이며
  `PENDING` · `payment_log` 0건 · **재고 미차감**이다.
  🔴 **"228행 전량 NULL" 은 96차에 깨졌다** — 위 「재고 쓰기 주체」절 참조. 다만 **주문 생성만
  으로는 재고가 움직이지 않는다**는 이 문단의 결론은 그대로 유효하며, 96차가 차감 시점을
  **결제 승인 경로(`confirm/route.ts:146` 트랜잭션 — 97차 #104 이후 줄 번호)** 로 확정했다.
  주문 생성만으로는 재고가 움직이지 않는다는 뜻이며, 차감 시점은 결제 승인 경로에 있다.
- `order_item.sku_snapshot`(text)이 주문 시점 SKU 스냅샷이다(55차 신설, product 조인 제거).
  `GET /api/v1/orders` 의 `sku` 는 이 컬럼에서 나온다 — product 조인으로 오추론하지 말 것.
- 🔴 **주문 API와 상품 API의 시각 파서가 다르다**(80차 실측). `updatedAfter` 에 마이크로초를
  붙이면 **상품 목록은 200, 주문 조회는 400**이다. 같은 시각 문자열 생성 코드를 두 API에
  쓰면 상품만 통과한다. **한쪽에서 통과한 형식을 다른 쪽의 근거로 쓰지 말 것.**
- 🔴 **`session.ipAddress` 는 실클라이언트 IP가 아니다**(80차 실측). 최근 전 건이
  `172.25.32.1`(WSL2가 보는 Windows 호스트 주소)이고 **원격 접속도 이 값으로 찍힌다.**
  접속 주체(사내/외부) 판별에 **쓸 수 없다.** Nginx 접근 로그(`/var/log/nginx/mysado_access.log`,
  14일 보존)를 본다 — 86차에 이 로그로 파트너 연동 개시를 특정했다.
- **`product` 의 인덱스는 3개다**(85차 #54 적용): `product_pkey(id)` · `product_group_id_idx(group_id)` ·
  **`product_sku_key(sku)` UNIQUE**(마이그레이션 `20260914234323_product_sku_unique`).
  **중복 `sku` INSERT/UPDATE는 DB가 거부한다.** `NULL` 은 위반이 아니다(49건 공존). 정준키(`KR` 제거)
  UNIQUE는 **없다**(별건). `updated_at`·`stock_updated_at` 에는 여전히 인덱스가 없어 `updatedAfter`
  류 필터는 풀스캔이다. 🔴 `scripts/product-insert-38.js`·`prisma/seed.js` 의 중복 sku INSERT는
  이제 **실행 시 DB 오류로 죽는다** — 재실행 전제로 읽지 말 것.
- **`product.status` DEFAULT 는 76차에 `'SALE'` → `'DRAFT'` 로 정정됐다.** 구 DEFAULT 는
  실데이터 0건인 고아값이라, status 를 생략한 INSERT 가 어떤 술어에도 걸리지 않고 목록에서
  조용히 사라졌다(58차 실측). **그래도 신규 상품 코드는 status 를 반드시 명시한다** —
  DEFAULT 는 안전망이지 설계가 아니며, 명시하지 않으면 코드만 읽어서 어떤 상태로 생기는지 알 수 없다.
- **신규 등록의 시작점은 `DRAFT` 다**(37차 §3-1, 75차 재확인).
  `lib/product-status.ts` 의 `PRODUCT_STATUS.DRAFT` 주석이 "등록 준비중 — 신규 INSERT ~
  검수 전. 비노출"이고, `scripts/product-insert-38.js` 가 `status: STATUS_DRAFT` /
  `isVisible: deriveIsVisible(STATUS_DRAFT)` 로 그 결정을 따른다.
  **DEFAULT 는 "가장 흔한 상태"가 아니라 "값이 생략됐을 때 안전한 상태"** 이므로
  실데이터 최다값(`ON_SALE`)을 근거로 삼지 않는다.
- 🟢 **DB 의 DEFAULT 는 `'DRAFT'` / `is_active=false` 다**(76차 마이그레이션
  `20260907122117_product_stock_updated_at_and_status_defaults`, 독립 psql 교차검증 완료).
  `deriveIsVisible('DRAFT') = false` 이므로 생략 INSERT 가 들어와도 비노출로 안착한다.
- **`product.stock_updated_at`** — `timestamp(3)` · **Nullable** · DEFAULT 없음 ·
  테이블 **맨 끝(42번째)**. 재고 변경 시각 전용이며 규칙은 「재고 쓰기 주체」절에 있다.
- 🔴 **`images[0]` 무가드 2곳** — `components/products/ProductCard.tsx:24` · `app/products/[id]/page.tsx:167`
  (84차 실측). 지금까지 안 터진 것은 **데이터가 지켜준 것**(NULL 0 · 빈 배열 0)이지 코드가 지킨 것이
  아니다. 등록이 빈 배열을 한 건 넣으면 그 카드가 있는 목록 전체가 죽는다 — 적재기 게이트에서
  `images` 빈 배열을 거부한다. 같은 부류로 `smartstore_url=''` 은 85차 `page.tsx:233~243` 조건부
  렌더로 가드됐다(실물 검증은 시험 5행 대기 — `''` 행이 아직 0건).

### 스타일·빌드
- **빌드는 CSS 실패를 잡아주지 않는다**(71차 신설). 존재하지 않거나 다른 규칙에 덮인 Tailwind
  클래스는 에러 없이 조용히 빠진다. `npm run build` 통과·`tsc` 통과·번들 크기 무변동이 전부
  정상이어도 화면만 어긋난다. **레이아웃·표시 변경은 "검증했다"고 보고하지 않는다** — 화면
  확인은 Chris가 한다.
- `display` 를 설정하는 유틸리티끼리는 충돌한다. `line-clamp-*` 는 `display:-webkit-box` 를
  쓰므로 같은 요소에 `block` 을 함께 걸면 무력화될 수 있다(71차 실측 증상, 기전 미확정).

### 셸
- 히스토리 확장: `!` 가 든 명령은 조용히 치환된다. `node -e`뿐 아니라 **`psql -c` 에서도 발생**(44차 실증).
  `!~`(정규식 부정)는 직전 명령으로 치환돼 쿼리가 깨진다 → **`NOT (컬럼 ~ '패턴')` 으로 쓴다.**
  `set +H`는 잊기 쉽고, 연산자 선택은 명령 안에 남는다.
- **빈 출력은 도구 문제가 아닐 수 있다.** 명령이 에러도 결과도 없이 침묵하면, 인자·패턴을 고쳐
  재시도하기 전에 **`echo alive`로 셸 stdout 생존을 먼저 확인**한다(49차: 출력 리다이렉션이 남아
  `echo`조차 나오지 않았고, 도구 쪽을 세 번 헛짚었다). 죽어 있으면 보고하고 Chris의 복구를 기다린다.
- heredoc은 `<< 'EOF'`(따옴표)로 셸 변수 확장 차단. **종료자는 `EOF` 대신 고유 문자열**을 쓴다
  (71차: CRLF 붙여넣기에서 `EOF\r` 로 깨지는 사고 방지).
- 도메인이 섞인 heredoc 붙여넣기 후 `grep '\['` 로 마크다운 링크 변환 손상 확인.
- 파일 편집은 python3 exact-match + `count == 1` 가드. 다중 행에 sed 금지.
  **치환이 여러 건이면 전량 선검사 후 일괄 쓰기**로 만들어 부분 적용 상태를 없앤다(71차).
- exact-match 앵커는 **빈 줄까지 실측**한다. 앵커 작성 전 빈 줄 위치를 확인하고,
  큰 블록 하나보다 작은 앵커 여럿으로 나눈다(무관한 코드를 앵커에 포함하지 말 것, 45차).
- **들여쓰기는 `cat -n` 을 눈으로 세지 말고 기계로 계측한다**(71차):
  `awk '{n=match($0,/[^ ]/)-1} /패턴/{print NR" indent="n"  "$0}' 파일`
  — `cat -n` 의 탭 2칸 함정(59차)을 우회하고 행번호·깊이·본문을 한 줄에 얻는다.
- `grep -rn 'A|B|C'` 는 `-E` 없이는 `|` 를 리터럴로 읽는다. **0건의 흔한 원인.**
- 🔴 **이 저장소에서 grep은 두 표기를 모두 건다**(84차 ⓘ). Prisma 필드명 ↔ DB 컬럼명 매핑표가
  위 「컬럼명」 절에 있다. `stock_quantity` 만 걸면 정본 경로 `lib/inventory.ts`(`stock`)가 빠지고,
  `variantLabel` 만 걸면 snake_case 화면 코드(`types/product.ts`)가 빠진다 — **0건이 아니라 목록
  누락**이라 더 조용하다. 패턴은 `-E 'stock_quantity|stock\b'` 처럼 양쪽을 교대로 건다.
- **`awk` 를 여러 파일에 걸 때 줄 번호는 `NR` 이 아니라 `FNR`**(85차 ⓚ). `NR` 은 누적이라
  두 번째 파일부터 밀린 번호를 낸다. 위 들여쓰기 계측 명령도 다중 파일이면 `FNR` 로 바꾼다.
- **파일로 받는 스크립트·지시서는 sha256 대조가 관문이다**(85차 ⓙ). 행수·말미·CR·구문 검사는
  형태만 보고, 붙여넣기 채널이 지운 `<a` 줄(85차)은 해시만 잡았다. HTML 태그 조각이 든 코드는
  분량과 무관하게 힙독이 아니라 파일로 받는다.
- **grep 범위에서 `scripts/`·`prisma/` 를 빼면 0건이 거짓이 된다**(75차 실증).
  `app`·`lib`·`components` 만 보고 `product.create` 0건이 나왔으나, 상품 INSERT 는
  `scripts/product-insert-38.js` 와 `prisma/seed.js` 에 있었다. 화면 기능이 아닌 것
  (일회성 등록·백필·시드)은 이 두 디렉터리에 산다. 58차 `components/` 규약의 확장이다.
- **`core.autocrlf=input` 이 CRLF 파일을 커밋 시 LF로 바꾼다**(73차 실증).
  저장소 blob과 디스크 파일의 sha256이 갈려 "저장소에서 꺼낸 것 = 전달한 것"이 성립하지
  않는다. `mysado-docs` 에는 `.gitattributes` 의 `*.csv -text` 로 차단해 두었다.
  CRLF가 의미를 갖는 파일을 새로 만들 때는 같은 조치가 필요한지 먼저 판단한다.
  확인은 `git check-attr text eol -- <경로>`(`unspecified` = 전역 설정이 그대로 먹는 상태),
  교정은 `git add --renormalize` 후 `git show HEAD:<경로> | sha256sum` 대조.
  **`-text` 는 속성 추가이지 파일 변경이 아니다** — additive-only 규약에 걸리지 않는다.

## 외부 전달 파일 발행 규약 (73차 신설)

파트너·대표님께 나가는 CSV·리포트는 **엑셀로 열리고, 편집되고, 저장되어 돌아온다.**
그 왕복을 견디게 만드는 것이 생성 코드의 책임이다.

- **인코딩은 UTF-8 BOM(`utf-8-sig`).** BOM이 없으면 한국어 엑셀이 CP949로 읽어 한글이
  모지바케되고, `?` 로 대체된 글자는 **복구 불가**다(73차 실측 — 파트너 회신 파일의
  상품명이 전량 손상됐다).
- **필드 안의 `,` `"` 개행 탭은 생성 시점에 공백으로 치환한다.** 따옴표 인용에 의존하면
  왕복 중 짝이 깨져 **행마다 필드 정렬이 ±1씩 어긋난다**. 목표는 `quotes=0` 인 CSV다.
- **줄바꿈은 CRLF.**
- **새 열은 맨 끝에 붙인다.** 중간 삽입은 헤더와 데이터의 열 위치가 어긋날 수 있다
  (73차: 회신 파일에서 헤더의 새 열은 15번째, 데이터의 그 값은 16번째였다).
- **검증은 `awk -F,` 로 한다.** 따옴표를 전혀 해석하지 않는 파서로도 전 행의 필드 수가
  같으면, 어떤 도구로 열어도 정렬이 어긋날 수 없다.

      awk -F, 'NR>1 && NF!=<열수> {c++} END {print "NF!=<열수> 행수: " c+0}' 파일

- **파일 변환 스크립트는 전량 선검사 후 일괄 쓰기로 짠다**(71차 `count == 1` 가드의 파일판).
  입력 레코드 수·컬럼 수·필드 오염을 먼저 전부 검사하고, 하나라도 어긋나면 `ABORT` 하며
  **출력 파일을 아예 만들지 않는다.** 부분 생성 파일이 남으면 그것이 정본으로 오인된다.
- **이미 커밋된 스냅샷으로 답할 수 있으면 DB를 다시 조회하지 않는다.** DB write가 0인
  구간에서는 커밋된 CSV가 유효한 스냅샷이고, 그것을 변환하는 편이 컬럼명을 다시 추측하지
  않아도 되고 바이트 출처가 sha256으로 증명된다.

## 스크립트 설계 규약
- 비멱등 스크립트는 `--data` 플래그 필수(기본값 없음). 직전 입력 파일은 감사 기록으로 보존한다.
- `expectedCurrent` 가드 — write 대상의 현재값을 입력에 명시하고 불일치 시 중단.
- 백필 UPDATE에는 `IS NULL` 조건을 넣어 멱등화.
- **DB·네트워크 없이 검증 불가한 산출물**(결제 라우트 등)은 정적 검사(tsc/lint/grep)와
  논리 대조까지가 한계다. 실행 검증은 Chris가 수행하므로, 검증했다고 보고하지 않는다.
- **`tsc` 는 산술도 문자열 처리도 검사하지 않는다.** 슬라이스·정규식·금액 계산은 실값으로
  검증하고, 검증 데이터는 **손으로 옮겨 적지 말고 원본에서 복사**한다(71차).

## 데이터 삭제 규약 (47차 신설)
- `additive-only`는 **스키마·마이그레이션 층위**의 규약이다. 운영 데이터 행의 삭제는 그 대상이
  아니지만, 대신 아래 5단계가 강제된다. 마이그레이션 SQL의 DROP/TRUNCATE/ALTER COLUMN/DELETE
  금지는 그대로 유효하다.
  1. `pg_dump` 백업 + **백업 내용 실측**(대상 테이블 행수 확인 — 파일 크기만으로 판단 금지)
  2. 삭제 대상과 CASCADE 자식 행 수를 `SELECT`로 사전 확정
  3. 사람 검수(`cat -n`)
  4. **단일 트랜잭션**(`psql -1 -f`) + 선두 가드 블록(기대값 불일치 시 `RAISE EXCEPTION`)
  5. 독립 재조회 교차검증
- 가드 블록은 `expectedCurrent` 가드의 SQL판이다. **자동 보정하지 않는다** — 불일치는
  "조사 이후 DB가 변했다"는 사건 신호다.
- **삭제 전, 그 행이 라이브 문서(사양서·계약)에 실응답으로 채록됐는지 확인한다**(67차 신설).
  채록됐으면 그 문서 재작업이 삭제의 선행조건이다. 핸드오프 참조는 불변 이력이라 무관하다.
- 식별자·실명이 든 정리 SQL은 커밋하지 않는다(git 이력은 사후 삭제가 어렵다).

## 진행 방식
- 설계 결정은 Chat(웹)에서 내려온다. 여기서는 지시서대로 **파일 조사·수정만** 수행.
- 추측 금지 — 확인 명령(grep/cat/tsc) 먼저.
- 🔴 **"그런 코드도 문서도 없다"를 보고하기 전에 그것이 있을 자리를 연다**(87차 신설).
  86차가 사양서를 열지 않고 "어느 문서에도 없다"를 단정해, 이미 있는 절을 중복 신설할 뻔했다.
  **기억도 grep 0건도 근거가 아니다 — 그 파일을 연 출력만이 근거다.**
- 🔴 **`파일:줄` 인용은 그 파일의 버전에 묶인다**(97차 신설). 코드를 고치면 이 문서·핸드오프의 줄
  번호 인용이 조용히 낡는다 — 결제 라우트를 고친 97차에 `confirm/route.ts:57`·`:67`·`:122` 가 전부
  어긋났다. **편집한 파일의 줄 번호는 편집 후 파일에서 다시 뜨고**, 이 문서가 인용하는 파일을
  고쳤으면 보고에 "CLAUDE.md 인용 N곳이 낡음"을 함께 적는다(이 문서의 개정은 Chris·Chat이 한다).
- 커밋은 Chris가 직접(메시지 초안만 제시). `git add`는 파일 명시(`git add .` 금지).
- 커밋 메시지는 conventional commit 한국어. 마이그레이션/기능/데이터는 커밋 분리.
- 임시 파일을 만들었으면 경로를 보고에 명시한다(`rm`이 deny라 스스로 지울 수 없음).
- 산출물(지시서·SQL·리포트)은 `~/apps/mysado-shop/outputs/`(gitignore). `~/output`은 존재하지 않는다.
  문서에 경로를 적을 때는 `ls`로 실재를 확인한다(47차: 두 세션 문서가 없는 경로를 기록).
- **`outputs/` 는 세션 중 스크래치 공간이며 정본이 아니다.** 세션이 끝나면 Chris가 지시서를
  `mysado-docs/worklog/`, 핸드오프를 `mysado-docs/handoff/phase<N>/` 로 옮겨 커밋한다.
  이 저장소에는 문서를 커밋하지 않는다 — dev·prod 커밋 격차를 코드 배포 신호로만 남기기 위함이다.
- 세션 종료 전 dev/prod `git log --oneline -1` 대조로 커밋 격차 확인.
  (prod 폴더는 deny 대상이므로 **Chris가 실행**하고 결과만 전달한다. 대조 자체를 생략하지 말 것)
- 수동 데이터 원복은 "기준선 복귀"가 아니라 **"원장 재계산"**이다.
  검증 중 실거래가 섞이면 시작값은 더 이상 정답이 아니다.

## 기술부채 (정리 대상, 선택)
- `lib/admin-guard.ts`의 `(session.user as { role?: string })` 캐스트는 불필요 —
  30차 검증상 `session.user.role` 직접 접근 가능(타입 `string | null | undefined`).
- ~~`product.status` DEFAULT 레거시 `'SALE'`~~ **76차 해소.** DEFAULT 는 `'DRAFT'` 로,
  `schema.prisma` 의 낡은 주석 `// SALE/OUTOFSTOCK/SUSPENSION` 도 같은 편집에서 정정됐다.
- `scripts/product-status-write.js` 폐기 표시 또는 삭제(76차 확정, 미착수 — 위 「절대 하지 말 것」참조).
- `group_role` 에 CHECK 제약이, `(group_id, variant_label)` 에 UNIQUE가 없다. additive 보강
  후보이나 필요성 미확정(70차).
- `VariantSelector.tsx:76` 의 `line-clamp-2` 가 화면에서 동작하지 않는다(71차, 위치는 84차 실증).
  `block` 제거로 해결될 가능성이 있으나 미검증 — 판정은 개발자도구의 계산된 `display` 값.

## 주요 파일
- `lib/auth.ts`(Better Auth) / `lib/prisma.ts`(싱글톤) / `lib/api-helpers.ts`(API 공용)
- `lib/product-status.ts`(상태 상수·술어) / `lib/inventory.ts`(재고 차감·복원) / `lib/delivery-fee.ts`(배송비 MAX, 59차)
- `lib/product-group.ts`(묶음 role 상수·술어, 71차) / `lib/products.ts`(`toProduct` 어댑터·
  `getProductById`·`getRelatedProducts`·`getGroupSiblings`)
- `types/product.ts`(`Product`·`Category` — **전량 snake_case**)
- `components/products/ProductCard.tsx`(목록·관련상품 공용 카드) /
  `components/products/detail/`(`Highlights`·`Compatibility`·`SpecTable`·`ShippingReturn`·
  `Notice`·**`VariantSelector`**(71차))
- `lib/api-v1/`(허브 연동 API — serializeOrder 단일 직렬화 경로)
- `lib/admin-guard.ts`(requireAdminPage/Api) / `middleware.ts`(PROTECTED_PATHS) / `prisma/schema.prisma`
- `app/api/health/route.ts`(DB 프로브 — `SELECT 1`, **force-dynamic** 로 ISR이 DB 장애를 200으로
  덮지 않게, 무인증 200/503. HetrixTools `mysado-health` 가 keyword `"db":"up"` 로 감시. 66차 신설)
- `.env` 계열 **4개** — `.env` / `.env.development` / `.env.production` / **`.env.local`**.
  🔴 **전부 읽지 말 것**(시크릿 포함, deny 대상). 아래는 "열지 않고 알아야 하는" 정보다.
  - 로드 우선순위 **`.env.local` > `.env.production` > `.env`**
    (`npm run build` 로그의 `Environments:` 줄이 그 순서를 출력한다)
  - **외부 서비스 키가 어느 파일에 있는지는 문서가 아니라 실물이 정본**이다. 92차에 절차서가
    `.env` 를 지목했으나 토스 키는 **`.env.local` 에만** 있었고, 그대로 고쳤다면 **편집은 성공하고
    값은 안 바뀌는 침묵 실패**가 났을 자리다. **확인·편집은 Chris가 한다 — 파일을 열어 확인하려
    하지 말고, 어느 파일인지 모르면 물어본다.**
  - `NEXT_PUBLIC_*` 는 **빌드 시점에 번들로 박힌다.** 값이 바뀌면 `pm2 restart` 로는 안 바뀌고
    **`npm run build` 가 필요**하다(89차 실측 · 92차 라이브 키 전환에서 실증).

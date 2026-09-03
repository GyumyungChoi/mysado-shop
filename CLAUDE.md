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

## 기술 스택
- Next.js 14.2.35 (App Router, CommonJS, **src/ 없음**) / TypeScript / Node 22
- PostgreSQL 16 / Prisma 6.19.3 (**버전 고정 — 업그레이드 금지**)
- Better Auth 1.6.23 / **Tailwind CSS 3.4.1** / Toss Payments / Resend (이메일)
- 서버: BOSGAME P4 Ultra, Windows 11 + WSL2 Ubuntu 24.04 / Nginx / PM2 / Let's Encrypt

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
  `schema.prisma` 157~159행).
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

### 재고 쓰기 주체 (`product.inventory_source`, 49차 신설 · 73차 복원)
- 값은 `HUB` 또는 `MANUAL` 두 가지. **기본값 `MANUAL`**(안전 방향 — 신규 상품이 실수로 허브
  관리로 분류돼 재고가 덮이지 않도록).
- `HUB` = 통합관리 프로그램(주승시스템)이 주기적으로 SET 하는 행. **Admin 업로드 차단.**
- `MANUAL` = Admin 수기·CSV 업로드로 관리하는 행. **API SET은 400 거부.**
- 교차 쓰기는 어느 방향도 허용하지 않는다. **재고를 바꾸는 코드를 새로 쓸 때 이 컬럼을
  검사하지 않으면 두 주체가 같은 행을 덮는다.** 검사 지점은 `lib/inventory.ts` 경유 규칙과
  같은 자리다.
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

### 데이터
- `NULL || jsonb` 는 조용히 NULL을 반환한다. 읽기 → JS 병합 → 전체 쓰기.
- Prisma `DateTime`은 **UTC로 저장**된다. KST 벽시계 값으로 필터하면 어긋난다.
- **`product.name` 이 변형 식별의 정본이다.** `variant_label` 은 색상명이 아니라
  **상품명 전체에 가까운 문자열**이다(71차 실측: prod-127~136 10건이 `name` 에서 기기 접두만
  빠진 형태). 화면에 그대로 쓰면 같은 묶음 안에서 앞부분이 전부 같아 변별이 되지 않으므로,
  표시할 때는 묶음 내 공통 접두·접미를 런타임에 깎는다
  (`components/products/detail/VariantSelector.tsx` 의 `commonAffix`/`trimAffix`).
  **DB 값은 고치지 않는다** — 원본이 스마트스토어 계열이라 재임포트 시 회귀 가능하고 정책 미정.
  ⚠️ "40자에서 잘린다"는 이전 서술은 **미확인으로 강등**했다(71차). 관측 10건의 최대 길이가
  정확히 40이나 최장값의 접미가 온전해 절단 흔적이 없다. `SELECT max(length(variant_label))`
  전수 확인 전까지 절단을 전제로 설계하지 않는다.
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
- `order_item.sku_snapshot`(text)이 주문 시점 SKU 스냅샷이다(55차 신설, product 조인 제거).
  `GET /api/v1/orders` 의 `sku` 는 이 컬럼에서 나온다 — product 조인으로 오추론하지 말 것.
- **`product.status` DEFAULT `'SALE'` 은 고아를 만든다.** 실데이터는 ON_SALE·SOLD_OUT·DISCONTINUED 3종뿐이고 'SALE'은 0건이다(58차 실측). status 를 생략한
  product INSERT/create 는 어떤 술어에도 걸리지 않아 목록에서 조용히 사라진다 — 신규 상품 코드는 status 를 반드시 명시한다.

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
- `product.status` DEFAULT가 레거시 `'SALE'` 문자열(37차 이전 체계). `ALTER COLUMN`이 필요해
  additive-only 규약상 별건 세션 대상.
  `schema.prisma`의 옆 주석 `// SALE/OUTOFSTOCK/SUSPENSION`도 낡았다 — 세 값 모두 현행 체계에
  없는 이름이며, 정본은 `lib/product-status.ts`의 6값이다. **주석만 고치는 것은 아무 세션에 동승 가능.**
- `group_role` 에 CHECK 제약이, `(group_id, variant_label)` 에 UNIQUE가 없다. additive 보강
  후보이나 필요성 미확정(70차).
- `VariantSelector.tsx` 의 `line-clamp-2` 가 화면에서 동작하지 않는다(71차). `block` 제거로
  해결될 가능성이 있으나 미검증.

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
- `.env.local` — **읽지 말 것**(시크릿 포함, deny 대상).

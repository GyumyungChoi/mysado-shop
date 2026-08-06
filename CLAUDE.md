# CLAUDE.md — mysado-shop 작업 지침

마이사도(mysado) 삼성 모바일 액세서리 커머스. Claude Code가 매 세션 자동으로 읽는 컨텍스트 파일.

> **이 문서에는 "현재 상태"를 적지 않는다.** 진행 상황·다음 작업·완료 목록은 최신 핸드오프가 정본이며,
> 여기에 적으면 반드시 낡아 잘못된 전제로 세션이 출발한다. 이 문서는 **변하지 않는 규약만** 담는다.

## 이 폴더의 정체 (★ 안전 핵심)
- 여기는 **dev 폴더** `~/apps/mysado-shop` (포트 3001). 개발·편집 전용.
- prod 폴더 `~/apps/mysado-shop-prod` (포트 3000, pm2)는 **절대 건드리지 않는다**. git pull 전용.
- dev와 prod는 **같은 PostgreSQL `mysado_db`를 공유한다**. 그래서 모든 DB 조작이 곧 운영 반영이다.

## 절대 하지 말 것 (settings.json에서 deny로 실제 차단됨)
- `prisma migrate reset` / DROP / TRUNCATE — 공유 DB라 복구 불가.
- `psql` / `prisma db execute` / `prisma db seed` — DB 직접 조작은 전부 Chris가 chat에서.
- `node` 실행 — `node -e`, `node scripts/*-write.js` 는 psql과 동등한 DB 쓰기 경로다.
  스크립트는 **작성만** 하고 실행은 Chris.
- `pm2` / `git push` / `git commit` / `npm install` / 배포 — 전부 Chris의 몫.
- 마이그레이션은 additive-only: `migrate dev` 금지, `--create-only` → SQL 육안검사 → `migrate deploy`.
- 승인 프롬프트의 **"always allow" 변형은 절대 선택하지 않는다**(Chris 규칙).

## 기술 스택
- Next.js 14.2.35 (App Router, CommonJS, **src/ 없음**) / TypeScript / Node 22
- PostgreSQL 16 / Prisma 6.19.3 (**버전 고정 — 업그레이드 금지**)
- Better Auth 1.6.23 / Tailwind CSS / Toss Payments / Resend (이메일)
- 서버: BOSGAME P4 Ultra, Windows 11 + WSL2 Ubuntu 24.04 / Nginx / PM2 / Let's Encrypt

## 현재 좌표
- **최신 핸드오프 문서가 상태의 정본이다.** 세션 시작 시 그 문서의 "세션 시작 프로토콜"을 먼저 실행.
- 이 문서를 근거로 "다음 작업이 무엇인지" 추론하지 말 것. 지시서 또는 Chat에서 내려온다.

## 코딩 규칙
- TypeScript, `any` 금지. 주석·에러 메시지는 한국어.
- 함수형 컴포넌트 + Hooks. Tailwind 클래스(별도 CSS 최소화). 모바일 우선.
- 에러 처리 필수 — `lib/api-helpers.ts`의 `ApiError`/`toErrorResponse`/`getUserId` 사용.
- 편집 후 반드시 `npx tsc --noEmit` (VS Code TS 서버 캐시보다 이게 authoritative).
- 라우트 파일은 HTTP 메서드 핸들러만 export.
- `findUnique` 대신 `findUniqueOrThrow` — 조용한 실패 방지.
- 상태 리터럴은 `lib/product-status.ts` 상수·술어로만. 직접 문자열 비교 금지.
- 재고 읽기/쓰기는 `lib/inventory.ts` 경유. 라우트에서 `product.updateMany` 직접 호출 금지.

## gotcha (함정)

### 컬럼명
- **컬럼 명명 규칙에 예측 가능한 패턴이 없다.** 테이블 단위로 갈리지 않고, 같은 테이블 안에 섞인다.
  - `user`: 코어 필드 camelCase(`emailVerified`·`createdAt`·`updatedAt`)
    + 프로젝트 추가 필드 snake_case(`phone_number`·`agreed_at`·`marketing_agreed`·`deleted_at`)
  - FK도 갈린다: `account`·`session`·**`product_view_log`·`search_log`** 는 `"userId"`(camelCase),
    `address`·`cart_item`·`orders` 는 `user_id`. **프로젝트 테이블이라고 snake_case가 아니다.**
- → **컬럼명은 어떤 경우에도 추측하지 말고 `\d "테이블명"` 으로 먼저 확인한다.**
  쌍따옴표 필요 여부도 그 출력으로 판단. 에러 시 psql HINT가 올바른 이름을 제시한다.
- Prisma 필드명 ≠ DB 컬럼명: `phoneNumber`↔`phone_number`, `deletedAt`↔`deleted_at`,
  product는 `stock`↔`stock_quantity`, `isVisible`↔`is_active`.
  (`stockQuantity`·`isActive`는 **존재하지 않는 이름**) — 매핑은 `schema.prisma`의 `@map`이 정본.
- `Order`는 테이블 `"orders"`(SQL 예약어). 테이블명 `user`도 예약어라 쌍따옴표 필요.
- 테이블 목록(추가될 수 있음, 정본은 '\dt' 출력): user, orders, session, account, address, cart_item, order_item, product,
  product_group, payment_log, product_view_log, search_log, verification, admin_audit_log.

### 데이터
- `NULL || jsonb` 는 조용히 NULL을 반환한다. 읽기 → JS 병합 → 전체 쓰기.
- Prisma `DateTime`은 **UTC로 저장**된다. KST 벽시계 값으로 필터하면 어긋난다.
- `product.name` 이 변형 식별의 정본. `variant_label`은 40자에서 잘린다.
- `contentMeta.<field>.locked === true` 인 필드는 **전용 정정 스크립트로만** 덮는다.
  `locked`를 해제하지 않고, `corrections` 배열에 `previousValue`·`previousSource`·`reason`을 누적한다.
  `source`가 `name-rule`인 값은 규칙 산출물이며 사람 검증값이 아니다.

### 셸
- 히스토리 확장: `!` 가 든 명령은 조용히 치환된다. `node -e`뿐 아니라 **`psql -c` 에서도 발생**(44차 실증).
  `!~`(정규식 부정)는 직전 명령으로 치환돼 쿼리가 깨진다 → **`NOT (컬럼 ~ '패턴')` 으로 쓴다.**
  `set +H`는 잊기 쉽고, 연산자 선택은 명령 안에 남는다.
- heredoc은 `<< 'EOF'`(따옴표)로 셸 변수 확장 차단.
- 도메인이 섞인 heredoc 붙여넣기 후 `grep '\['` 로 마크다운 링크 변환 손상 확인.
- 파일 편집은 python3 exact-match + `count == 1` 가드. 다중 행에 sed 금지.

## 스크립트 설계 규약
- 비멱등 스크립트는 `--data` 플래그 필수(기본값 없음). 직전 입력 파일은 감사 기록으로 보존한다.
- `expectedCurrent` 가드 — write 대상의 현재값을 입력에 명시하고 불일치 시 중단.
- 백필 UPDATE에는 `IS NULL` 조건을 넣어 멱등화.
- **DB·네트워크 없이 검증 불가한 산출물**(결제 라우트 등)은 정적 검사(tsc/lint/grep)와
  논리 대조까지가 한계다. 실행 검증은 Chris가 수행하므로, 검증했다고 보고하지 않는다.

## 진행 방식
- 설계 결정은 Chat(웹)에서 내려온다. 여기서는 지시서대로 **파일 조사·수정만** 수행.
- 추측 금지 — 확인 명령(grep/cat/tsc) 먼저.
- 커밋은 Chris가 직접(메시지 초안만 제시). `git add`는 파일 명시(`git add .` 금지).
- 커밋 메시지는 conventional commit 한국어. 마이그레이션/기능/데이터는 커밋 분리.
- 임시 파일을 만들었으면 경로를 보고에 명시한다(`rm`이 deny라 스스로 지울 수 없음).
- 세션 종료 전 dev/prod `git log --oneline -1` 대조로 커밋 격차 확인.
  (prod 폴더는 deny 대상이므로 **Chris가 실행**하고 결과만 전달한다. 대조 자체를 생략하지 말 것)
- 수동 데이터 원복은 "기준선 복귀"가 아니라 **"원장 재계산"**이다.
  검증 중 실거래가 섞이면 시작값은 더 이상 정답이 아니다.

## 기술부채 (정리 대상, 선택)
- `lib/admin-guard.ts`의 `(session.user as { role?: string })` 캐스트는 불필요 —
  30차 검증상 `session.user.role` 직접 접근 가능(타입 `string | null | undefined`).
- `product.status` DEFAULT가 레거시 `'SALE'` 문자열(37차 이전 체계).

## 주요 파일
- `lib/auth.ts`(Better Auth) / `lib/prisma.ts`(싱글톤) / `lib/api-helpers.ts`(API 공용)
- `lib/product-status.ts`(상태 상수·술어) / `lib/inventory.ts`(재고 차감·복원)
- `lib/admin-guard.ts`(requireAdminPage/Api) / `middleware.ts`(PROTECTED_PATHS) / `prisma/schema.prisma`
- `.env.local` — **읽지 말 것**(시크릿 포함, deny 대상).

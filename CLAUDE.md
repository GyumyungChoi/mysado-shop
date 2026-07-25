# CLAUDE.md — mysado-shop 작업 지침

마이사도(mysado) 삼성 모바일 액세서리 커머스. Claude Code가 매 세션 자동으로 읽는 컨텍스트 파일.

## 이 폴더의 정체 (★ 안전 핵심)
- 여기는 **dev 폴더** `~/apps/mysado-shop` (포트 3001). 개발·편집·커밋 전용.
- prod 폴더 `~/apps/mysado-shop-prod` (포트 3000, pm2)는 **절대 건드리지 않는다**. git pull 전용.
- dev와 prod는 **같은 PostgreSQL `mysado_db`를 공유한다**. 그래서 모든 DB 조작이 곧 운영 반영이다.

## 절대 하지 말 것 (settings.json에서도 deny로 차단됨)
- `prisma migrate reset` / DROP / TRUNCATE — 공유 DB라 복구 불가.
- `psql` 직접 조작 — 검증·마이그레이션은 Chris가 chat에서 직접.
- `pm2` / `git push` / `git commit` / 배포 — 전부 Chris의 몫.
- 마이그레이션은 additive-only: `migrate dev` 금지, `--create-only` → SQL 육안검사 → `migrate deploy`.

## 기술 스택
- Next.js 14.2.35 (App Router, CommonJS, **src/ 없음**) / TypeScript
- PostgreSQL 16 / Prisma 6.19.3 (**버전 고정 — 업그레이드 금지**)
- Better Auth 1.6.23 / Tailwind CSS / Toss Payments (테스트 키) / Resend (이메일)
- 서버: BOSGAME P4 Ultra, Windows 11 + WSL2 Ubuntu 24.04 / Nginx / PM2 / Let's Encrypt

## 현재 단계
Phase 7 (마이페이지). Phase 1~6 완료(정적페이지·인증·상품DB·장바구니/주문/Toss결제·
webhook/취소·admin·상품검색). 진행 중: 탈퇴 Soft Delete 구현.

## 코딩 규칙 (기존 유지)
- TypeScript, `any` 금지. 주석·에러 메시지는 한국어.
- 함수형 컴포넌트 + Hooks. Tailwind 클래스(별도 CSS 최소화). 모바일 우선.
- 에러 처리 필수 — 이 프로젝트는 `lib/api-helpers.ts`의 `ApiError`/`toErrorResponse`/`getUserId` 사용.
- 편집 후 반드시 `npx tsc --noEmit` (VS Code TS 서버 캐시보다 이게 authoritative).

## gotcha (컬럼명 함정)
- Prisma 필드명 ≠ DB 컬럼명: `phoneNumber`↔`phone_number`, `deletedAt`↔`deleted_at`,
  product는 `@map("is_active")`. 코드는 Prisma명, psql은 컬럼명.
- `Order`는 테이블 `"orders"`(SQL 예약어). SearchLog 컬럼은 camelCase(psql에서 쌍따옴표).

## 진행 방식
- 설계 결정은 Chat(웹)에서 내려온다. 여기서는 지시서대로 **파일 조사·수정만** 수행.
- 추측 금지 — 확인 명령(grep/cat/tsc) 먼저. 커밋은 Chris가 직접(메시지 초안만 제시).
- `git add`는 파일 명시(`git add .` 금지). 커밋 메시지는 conventional commit 한국어, feature/docs 분리.

## 주요 파일
- `lib/auth.ts`(Better Auth) / `lib/prisma.ts`(싱글톤) / `lib/api-helpers.ts`(API 공용)
- `lib/admin-guard.ts`(requireAdminPage/Api) / `middleware.ts`(PROTECTED_PATHS) / `prisma/schema.prisma`
- `.env.local` — **읽지 말 것**(시크릿 포함, deny 대상). 앱
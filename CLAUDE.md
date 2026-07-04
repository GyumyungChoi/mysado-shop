# CLAUDE.md — 프로젝트 가이드

# 마이사도(mysado) 삼성 휴대폰 액세서리 쇼핑몰

> 이 파일은 Claude Code가 프로젝트를 이해하기 위한 컨텍스트 파일입니다.
> 프로젝트 루트에 이 파일을 두면 claude 실행 시 자동으로 읽습니다.

---

## 프로젝트 개요

- **목적**: 삼성 휴대폰 액세서리(케이스, 충전기) 자체 쇼핑몰
- **운영자**: 법인 사업자 (우승문), 스마트스토어/쿠팡 운영 중
- **현재 단계**: Phase 1 — 회사 소개 + 상품 목록 정적 사이트

## 기술 스택

```
Frontend:  Next.js 14 (App Router)
Styling:   Tailwind CSS
Language:  TypeScript
Data:      정적 JSON (Phase 1)
           PostgreSQL (Phase 2부터)
도메인:     mysado.net
Server:    BOSGAME P4 Ultra (Ryzen 7 7730U, Ubuntu 24.04)
WebServer: Nginx 리버스 프록시
Process:   PM2
```

## 프로젝트 구조

```
mysado-shop/
├── app/
│   ├── page.tsx              ← 메인 페이지
│   ├── about/page.tsx        ← 회사 소개
│   ├── products/
│   │   ├── page.tsx          ← 상품 목록
│   │   └── [id]/page.tsx     ← 상품 상세
│   ├── contact/page.tsx      ← 문의하기
│   └── api/
│       ├── products/route.ts
│       ├── products/[id]/route.ts
│       └── contact/route.ts
├── components/
│   ├── layout/Header.tsx
│   ├── layout/Footer.tsx
│   └── products/ProductCard.tsx
├── data/
│   ├── products.json         ← Phase 1 정적 상품 데이터
│   └── categories.json       ← 카테고리 데이터
├── public/images/products/   ← 상품 이미지
└── CLAUDE.md
```

## 코딩 규칙

- **언어**: TypeScript 사용 (any 타입 금지)
- **주석**: 한국어로 작성
- **함수**: JSDoc 주석 필수
- **컴포넌트**: 함수형 컴포넌트 + React Hooks
- **스타일**: Tailwind CSS 클래스 사용 (별도 CSS 파일 최소화)
- **반응형**: 모바일 우선 (mobile-first)
- **에러 처리**: try-catch 필수, 사용자 친화적 메시지

## Phase 1 범위 (현재 작업)

### ✅ 포함

- 5개 정적 페이지 (메인/소개/상품목록/상세/문의)
- JSON 기반 상품 데이터
- 문의 이메일 발송 (Nodemailer)
- Nginx + HTTPS 배포

### ❌ 제외 (Phase 2~3에서 추가)

- 결제 기능 (Phase 3)
- 회원가입/로그인 (Phase 3)
- 장바구니 (Phase 3)
- 데이터베이스 (Phase 2)

## 환경 변수 (.env.local)

```
SMTP_USER=contact@mysado.net
SMTP_PASS=google-app-password
CONTACT_EMAIL=contact@mysado.net
```

## 자주 쓰는 명령어

```bash
# 개발 서버 실행
npm run dev

# 빌드
npm run build

# PM2로 실행 (서버)
pm2 start npm --name "mysado-shop" -- start

# PM2 상태 확인
pm2 list

# Nginx 설정 확인
sudo nginx -t

# Nginx 재시작
sudo systemctl reload nginx
```

## 중요 파일 위치 (서버)

```
앱 위치:     ~/apps/mysado-shop/
Nginx 설정:  /etc/nginx/sites-available/mysado
환경 변수:   ~/apps/mysado-shop/.env.local
PM2 설정:    ~/apps/mysado-shop/ecosystem.config.js
```

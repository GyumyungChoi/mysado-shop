import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/** 로그인해야만 접근 가능한 경로 (앞으로 여기에 추가) */
const PROTECTED_PATHS = ["/mypage", "/cart"];

/** 로그인 상태면 접근할 필요 없는 경로 */
const AUTH_PATHS = ["/login", "/signup"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 쿠키 존재 여부만 확인 (Edge 런타임 — DB 조회 불가, 1차 차단용)
  const sessionCookie = getSessionCookie(request);

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p));

  // 비로그인 상태로 보호 경로 접근 → 로그인 페이지로
  if (isProtected && !sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 로그인 상태로 로그인/가입 페이지 접근 → 홈으로
  if (isAuthPage && sessionCookie) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // middleware를 실행할 경로만 지정 (정적 파일/이미지 등 제외)
  matcher: ["/mypage/:path*", "/cart/:path*", "/login", "/signup"],
};
// admin 접근 제어 2차 방어 헬퍼 — Phase 5 (26.07.18)
// 1차: middleware.ts (쿠키 존재만 확인, Edge)
// 2차: 본 헬퍼 (DB 세션 기준 role 검증 — 쿠키 위조 방어)
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** 페이지(서버 컴포넌트)용 — 비로그인 → /login, 비admin → / 로 redirect */
export async function requireAdminPage() {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session) redirect("/login?redirect=/admin");
  if ((session.user as { role?: string }).role !== "admin") redirect("/");
  return session; // 통과 시 세션 반환
}

/** API(라우트 핸들러)용 — 미통과 시 null 반환 (호출 측에서 403 응답) */
export async function requireAdminApi() {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session) return null;
  if ((session.user as { role?: string }).role !== "admin") return null;
  return session;
}

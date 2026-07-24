import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import PasswordForm from "./PasswordForm";

// 인증 필요 페이지 — 캐싱 차단 (profile과 동일)
export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  // 2차 검증: DB에서 실제 세션 유효성 확인 (middleware는 쿠키 존재만 봄)
  const session = await auth.api.getSession({
    headers: headers(),
  });

  if (!session) {
    redirect("/login");
  }

  // profile과 달리 DB 조회 없음 — 표시할 기존 값이 없는 화면
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/mypage" className="text-sm text-gray-400 hover:text-gray-600">
          &larr; 마이페이지
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-bold">비밀번호 변경</h1>

      <PasswordForm />
    </main>
  );
}

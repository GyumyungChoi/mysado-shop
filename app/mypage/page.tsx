import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";

export default async function MyPage() {
  // 2차 검증: DB에서 실제 세션 유효성 확인 (middleware는 쿠키 존재만 봄)
  const session = await auth.api.getSession({
    headers: headers(),
  });

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold">마이페이지</h1>
      <div className="rounded-lg border border-gray-200 p-6 text-sm">
        <p className="mb-2">
          <span className="font-medium">이름:</span> {session.user.name}
        </p>
        <p className="mb-2">
          <span className="font-medium">이메일:</span> {session.user.email}
        </p>
        <p className="text-gray-500">
          가입일: {new Date(session.user.createdAt).toLocaleDateString("ko-KR")}
        </p>
      </div>
      <Link
        href="/mypage/orders"
        className="mt-4 block rounded-lg border border-gray-200 p-4 text-sm font-medium hover:bg-gray-50"
      >
        주문 내역 보기 &rarr;
      </Link>
    </main>
  );
}
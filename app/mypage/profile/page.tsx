import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ProfileForm from "./ProfileForm";

// 수정 직후 refresh가 낡은 값을 받으면 안 됨 — 캐싱 차단
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  // 2차 검증: DB에서 실제 세션 유효성 확인 (middleware는 쿠키 존재만 봄)
  const session = await auth.api.getSession({
    headers: headers(),
  });

  if (!session) {
    redirect("/login");
  }

  // 세션 캐시 대신 DB 직접 조회 — refresh 시 최신값 보장
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, phoneNumber: true, marketingAgreed: true },
  });

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/mypage" className="text-sm text-gray-400 hover:text-gray-600">
          &larr; 마이페이지
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-bold">내 정보 수정</h1>

      {/* 이메일 — 로그인 식별자라 변경 불가 (인증 도입 후 별도 기능 예정) */}
      <div className="mb-6 rounded-lg border border-gray-200 p-4 text-sm">
        <p className="mb-1 font-medium">이메일</p>
        <p className="text-gray-700">{user.email}</p>
        <p className="mt-1 text-xs text-gray-400">이메일 변경은 문의하기를 이용해 주세요.</p>
      </div>

      <ProfileForm
        initialName={user.name}
        initialPhoneNumber={user.phoneNumber}
        initialMarketingAgreed={user.marketingAgreed}
      />
    </main>
  );
}

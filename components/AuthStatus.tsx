"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";

export default function AuthStatus() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  // 세션 확인 중 (깜빡임 방지용 자리 차지)
  if (isPending) {
    return <div className="w-16 text-sm text-gray-400">&nbsp;</div>;
  }

  // 로그인 상태
  if (session) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <Link
          href="/mypage"
          className="font-medium text-gray-900 transition-colors hover:text-blue-600"
        >
          {session.user.name}님
        </Link>
        <button
          onClick={async () => {
            await signOut();
            router.push("/");
            router.refresh();
          }}
          className="text-gray-500 transition-colors hover:text-gray-900"
        >
          로그아웃
        </button>
      </div>
    );
  }

  // 비로그인 상태
  return (
    <div className="flex items-center gap-3 text-sm font-medium text-gray-600">
      <Link href="/login" className="transition-colors hover:text-gray-900">
        로그인
      </Link>
      <Link
        href="/signup"
        className="rounded-md bg-gray-900 px-3 py-1.5 text-white transition-colors hover:bg-gray-700"
      >
        회원가입
      </Link>
    </div>
  );
}
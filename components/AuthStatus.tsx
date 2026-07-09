"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth-client";

export default function AuthStatus() {
  const { data: session, isPending } = useSession();

  // 세션 확인 중 (깜빡임 방지용 자리 차지)
  if (isPending) {
    return <div className="w-16 text-sm text-gray-400">&nbsp;</div>;
  }

  // 로그인 상태
  if (session) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium text-gray-900">
          {session.user.name}님
        </span>
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
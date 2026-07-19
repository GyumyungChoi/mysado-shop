"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth-client";

/** 로그인 상태 아이콘 — 로그인 시 파란 점 + /mypage, 비로그인 시 /login */
export default function UserIcon() {
  const { data: session, isPending } = useSession();

  // 세션 확인 중 (아이콘 자리만 유지 — 깜빡임 방지)
  if (isPending) {
    return <div className="h-[22px] w-[22px]" aria-hidden="true" />;
  }

  return (
    <Link
      href={session ? "/mypage" : "/login"}
      aria-label={session ? `${session.user.name}님 마이페이지` : "로그인"}
      className="relative text-gray-600 transition-colors hover:text-gray-900"
    >
      {/* 사람 아이콘 (인라인 SVG) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
      {/* 로그인 상태 표시 점 */}
      {session && (
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-blue-500" />
      )}
    </Link>
  );
}

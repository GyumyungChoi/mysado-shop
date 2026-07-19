"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";

interface MenuCategory {
  id: string;
  name: string;
}

/** ☰ 버튼 클릭 시 펼쳐지는 통합 메뉴 (카테고리 + 마이메뉴 + 인증) */
export default function HeaderMenu({ categories }: { categories: MenuCategory[] }) {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);

  // 메뉴 바깥 클릭 시 닫기 (backdrop-filter가 fixed 오버레이의 기준을
  // 바꿔버리므로 오버레이 대신 document 리스너 방식 사용)
  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const handleSignOut = async () => {
    close();
    await signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div ref={menuRef}>
      <button
        type="button"
        aria-label="전체 메뉴"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="text-gray-600 transition-colors hover:text-gray-900"
      >
        {/* 햄버거 아이콘 (인라인 SVG) */}
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
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-4 top-full z-50 mt-1 w-56 rounded-lg border border-gray-100 bg-white py-2 shadow-lg sm:right-6">
            {/* 인사말 (로그인 시) */}
            {session && (
              <p className="border-b border-gray-100 px-4 pb-2 pt-1 text-sm font-medium text-gray-900">
                {session.user.name}님
              </p>
            )}

            {/* 카테고리 */}
            <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase text-gray-400">
              카테고리
            </p>
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/products?category=${category.id}`}
                onClick={close}
                className="block px-4 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
              >
                {category.name}
              </Link>
            ))}

            <div className="my-2 border-t border-gray-100" />

            {/* 고정 링크 */}
            <Link
              href="/about"
              onClick={close}
              className="block px-4 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              회사소개
            </Link>
            <Link
              href="/contact"
              onClick={close}
              className="block px-4 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              문의하기
            </Link>

            <div className="my-2 border-t border-gray-100" />

            {/* 인증 영역 */}
            {isPending ? (
              <p className="px-4 py-1.5 text-sm text-gray-400">&nbsp;</p>
            ) : session ? (
              <>
                <Link
                  href="/mypage"
                  onClick={close}
                  className="block px-4 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                >
                  나의 정보
                </Link>
                <Link
                  href="/mypage/orders"
                  onClick={close}
                  className="block px-4 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                >
                  주문·배송 조회
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="block w-full px-4 py-1.5 text-left text-sm text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
                >
                  로그아웃
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={close}
                  className="block px-4 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                >
                  로그인
                </Link>
                <Link
                  href="/signup"
                  onClick={close}
                  className="block px-4 py-1.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
                >
                  회원가입
                </Link>
              </>
            )}
        </div>
      )}
    </div>
  );
}

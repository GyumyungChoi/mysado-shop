import Link from "next/link";
import AuthStatus from "@/components/AuthStatus";
import CartBadge from "@/components/layout/CartBadge";

/** 사이트 상단 헤더 (로고 + 네비게이션) */
export default function Header() {
  const navItems = [
    { href: "/", label: "홈" },
    { href: "/about", label: "회사소개" },
    { href: "/products", label: "상품" },
    { href: "/contact", label: "문의하기" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-xl font-bold tracking-tight text-gray-900">
          마이사도
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium text-gray-600 sm:gap-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition-colors hover:text-gray-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <Link
            href="/cart"
            aria-label="장바구니"
            className="relative text-gray-600 transition-colors hover:text-gray-900"
          >
            {/* 장바구니 아이콘 (인라인 SVG — 외부 의존성 없음) */}
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
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <CartBadge />
          </Link>
          <AuthStatus />
        </div>
      </div>
    </header>
  );
}

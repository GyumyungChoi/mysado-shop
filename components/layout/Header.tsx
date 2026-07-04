import Link from "next/link";

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
      </div>
    </header>
  );
}

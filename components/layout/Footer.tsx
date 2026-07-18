import Link from "next/link";

/** 사이트 하단 푸터 (사업자 정보 + 정책 링크) */
export default function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-gray-500 sm:px-6">
        {/* 정책 링크 */}
        <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-2 text-gray-600">
          <Link href="/about" className="hover:text-blue-600">회사 소개</Link>
          <Link href="/faq" className="hover:text-blue-600">자주 묻는 질문</Link>
          <Link href="/shipping" className="hover:text-blue-600">배송·교환/환불 안내</Link>
          <Link href="/terms" className="hover:text-blue-600">이용약관</Link>
          <Link href="/privacy" className="font-semibold hover:text-blue-600">개인정보처리방침</Link>
        </nav>

        {/* 사업자 정보 — 토스페이먼츠 심사 필수 항목 */}
        <p className="mb-2 font-semibold text-gray-700">마이사도(mysado)</p>
        <div className="space-y-1 text-[11px] leading-relaxed">
          <p>
            (주)주승시스템 대표이사 : 우승문 | 사업자등록번호: 693-86-03370 |
            서울특별시 금천구 가산디지털1로 75-15, 10층 1025호 | 통신판매업
            신고 : 2026-서울금천-0272 | 전화 : 000-0000-0000 | 고객센터
            이메일: mysado.shop@gmail.com
          </p>
          <p>[스마트스토어] smartstore.naver.com/mysado, smartstore.naver.com/royvente</p>
        </div>
        <p className="mt-6 text-xs text-gray-400">
          &copy; {new Date().getFullYear()} mysado. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

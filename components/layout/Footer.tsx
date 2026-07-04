/** 사이트 하단 푸터 (사업자 정보) */
export default function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-gray-500 sm:px-6">
        <p className="mb-2 font-semibold text-gray-700">마이사도(mysado)</p>
        <div className="space-y-1 leading-relaxed">
          <p>대표자: 우승문</p>
          <p>고객센터 이메일: contact@mysado.net</p>
          <p>스마트스토어: smartstore.naver.com/mysado</p>
        </div>
        <p className="mt-6 text-xs text-gray-400">
          &copy; {new Date().getFullYear()} mysado. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

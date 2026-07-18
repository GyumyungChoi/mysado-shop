import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

/** 취급 제품군 목록 */
const PRODUCT_LINES = [
  { icon: "📱", name: "케이스" },
  { icon: "🔌", name: "충전기" },
  { icon: "🎧", name: "이어폰" },
  { icon: "⌚", name: "워치 액세서리" },
  { icon: "🛡️", name: "보호필름" },
];

/** 회사 소개 페이지 */
export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* 히어로 섹션 */}
        <section className="bg-gradient-to-b from-blue-50 to-white px-4 py-16 text-center sm:px-6 sm:py-24">
          <p className="text-sm font-semibold tracking-wide text-blue-600">
            MYSADO
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            마이사도
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-gray-500 sm:text-lg">
            삼성 휴대폰 액세서리 전문 브랜드
          </p>
        </section>

        {/* 브랜드 스토리 */}
        <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="mb-6 text-xl font-bold text-gray-900 sm:text-2xl">
            브랜드 스토리
          </h2>
          <div className="space-y-4 leading-relaxed text-gray-600">
            <p>
              마이사도(MYSADO)는 삼성 갤럭시 사용자를 위한 액세서리를
              전문으로 다루는 브랜드입니다. 하루의 대부분을 함께하는
              휴대폰인 만큼, 사용자의 손에 오래 남는 물건을 만들고자
              시작했습니다.
            </p>
            <p>
              네이버 스마트스토어와 쿠팡을 통해 고객을 만나며 쌓아온
              신뢰를 바탕으로, 이제 마이사도만의 공간에서 더 다양한
              제품과 정보를 전해드리고자 합니다.
            </p>
            <p>
              품질과 실용성을 최우선으로, 갤럭시와 함께하는 모든 순간이
              더 특별해질 수 있도록 마이사도가 함께하겠습니다.
            </p>
            <p>
              마이사도는 (주)주승시스템이 운영하는 삼성 모바일 액세서리
              전문 브랜드이며, mysado.net은 마이사도의 공식 자사몰입니다.
            </p>
          </div>
        </section>

        {/* 취급 제품군 */}
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="mb-6 text-xl font-bold text-gray-900 sm:text-2xl">
            취급 제품군
          </h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 sm:gap-4">
            {PRODUCT_LINES.map((line) => (
              <div
                key={line.name}
                className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 py-6"
              >
                <span className="text-3xl">{line.icon}</span>
                <span className="text-sm font-medium text-gray-700">
                  {line.name}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* 운영 채널 */}
        <section className="mx-auto max-w-3xl px-4 py-12 text-center sm:px-6 sm:py-16">
          <h2 className="mb-4 text-xl font-bold text-gray-900 sm:text-2xl">
            운영 채널
          </h2>
          <p className="mb-8 text-gray-500">
            공식 자사몰 mysado.net 외에도 네이버 스마트스토어와 쿠팡에서
            마이사도 제품을 만나보실 수 있습니다.
          </p>
          <a
            href="https://smartstore.naver.com/mysado"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-full bg-gray-900 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-700 sm:text-base"
          >
            네이버 스마트스토어 바로가기
          </a>
        </section>
      </main>

      <Footer />
    </div>
  );
}

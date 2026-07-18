import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "자주 묻는 질문 | 마이사도",
  description:
    "마이사도 배송, 주문, 교환/환불, 상품 관련 자주 묻는 질문과 답변",
};

const faqs = [
  {
    q: "어떤 상품을 판매하나요?",
    a: "삼성 갤럭시 스마트폰 케이스, 충전기, 화면 보호필름, 갤럭시 워치 액세서리 등 삼성 모바일 기기 전용 액세서리를 판매합니다. 전 상품 목록은 상품 페이지에서 확인하실 수 있습니다.",
  },
  {
    q: "배송은 얼마나 걸리나요?",
    a: "결제 완료 후 영업일 기준 2~5일 이내에 발송됩니다. 도서·산간 지역은 1~2일 추가 소요될 수 있습니다.",
  },
  {
    q: "주문을 취소하고 싶어요.",
    a: "발송 전 주문은 마이페이지 > 주문 내역에서 직접 취소할 수 있습니다. 결제 금액은 원 결제 수단으로 환불되며, 카드 취소는 카드사 정책에 따라 3~7영업일 소요될 수 있습니다.",
  },
  {
    q: "교환이나 반품은 어떻게 하나요?",
    a: "단순 변심은 상품 수령일로부터 7일 이내, 불량·오배송은 수령일로부터 3개월 이내에 신청 가능합니다. 고객센터 이메일(mysado.shop@gmail.com)로 주문번호와 사유를 보내주시면 안내해 드립니다. 자세한 내용은 배송·교환/환불 안내 페이지를 참고해 주세요.",
  },
  {
    q: "제 기종에 맞는 액세서리인지 어떻게 확인하나요?",
    a: "각 상품 상세 페이지에 호환 기종이 표기되어 있습니다. 갤럭시 S 시리즈, Z 폴드/플립 시리즈, 갤럭시 워치 등 모델명을 확인 후 주문해 주세요. 기종 확인이 어려우시면 고객센터로 문의해 주시기 바랍니다.",
  },
  {
    q: "결제는 어떤 방법으로 할 수 있나요?",
    a: "토스페이먼츠를 통해 신용/체크카드 등으로 안전하게 결제하실 수 있습니다. 카드 정보는 당사 서버에 저장되지 않습니다.",
  },
  {
    q: "네이버 스마트스토어에서도 구매할 수 있나요?",
    a: "네, 마이사도는 네이버 스마트스토어(smartstore.naver.com/mysado)와 쿠팡에서도 동일한 상품을 판매하고 있습니다. 공식 자사몰인 mysado.net에서 최신 상품 정보를 가장 먼저 확인하실 수 있습니다.",
  },
];

/** 자주 묻는 질문 — 정적 페이지 (FAQPage JSON-LD 포함) */
export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1 className="mb-8 text-2xl font-bold text-gray-900">
        자주 묻는 질문
      </h1>

      <div className="space-y-6">
        {faqs.map((f) => (
          <section
            key={f.q}
            className="rounded-lg border border-gray-100 bg-white p-5"
          >
            <h2 className="mb-2 text-base font-semibold text-gray-900">
              Q. {f.q}
            </h2>
            <p className="text-sm leading-relaxed text-gray-700">A. {f.a}</p>
          </section>
        ))}
      </div>
      </main>
      <Footer />
    </div>
  );
}

import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "배송·교환/환불 안내 | 마이사도",
  description: "마이사도 배송 정책, 교환 및 환불 안내",
};

/** 배송·교환/환불 안내 — 정적 페이지 (토스페이먼츠 심사 요건) */
export default function ShippingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
      <h1 className="mb-8 text-2xl font-bold text-gray-900">
        배송·교환/환불 안내
      </h1>

      <div className="space-y-8 text-sm leading-relaxed text-gray-700">
        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            배송 안내
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>배송 방법: 택배 배송</li>
            <li>배송 지역: 대한민국 전 지역</li>
            <li>
              배송 기간: 결제 완료 후 영업일 기준 2~5일 이내 발송 (도서·산간
              지역은 1~2일 추가 소요될 수 있습니다)
            </li>
            <li>
              배송비: 상품 및 주문 금액에 따라 상이하며, 주문 시 결제 화면에
              표시됩니다
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            교환·반품 안내
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              단순 변심: 상품 수령일로부터 7일 이내 신청 가능 (왕복 배송비
              고객 부담)
            </li>
            <li>
              상품 불량·오배송: 상품 수령일로부터 3개월 이내, 또는 그 사실을
              안 날로부터 30일 이내 신청 가능 (배송비 회사 부담)
            </li>
            <li>
              신청 방법: 고객센터 이메일(mysado.shop@gmail.com)로 주문번호와
              사유를 보내주시면 안내해 드립니다
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            교환·반품이 불가능한 경우
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>이용자의 책임 있는 사유로 상품이 멸실·훼손된 경우</li>
            <li>
              포장을 개봉하여 사용하거나 일부 소비하여 상품의 가치가 현저히
              감소한 경우 (예: 보호필름 부착 후)
            </li>
            <li>시간 경과로 재판매가 곤란할 정도로 상품 가치가 감소한 경우</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            환불 안내
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              결제 취소·환불은 원 결제 수단으로 처리됩니다 (카드 결제 취소는
              카드사 정책에 따라 3~7영업일 소요될 수 있습니다)
            </li>
            <li>
              발송 전 주문은 마이페이지 &gt; 주문 내역에서 직접 취소할 수
              있습니다
            </li>
            <li>
              반품에 따른 환불은 회사가 상품을 회수하여 확인한 후 3영업일
              이내에 처리됩니다
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">문의</h2>
          <p>
            배송·교환·환불 관련 문의는 고객센터
            이메일(mysado.shop@gmail.com)로 연락해 주시기 바랍니다.
          </p>
        </section>
      </div>
      </main>
      <Footer />
    </div>
  );
}
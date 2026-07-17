"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

/**
 * 토스 failUrl 랜딩 페이지 — 결제창 단계 실패(카드 거절, 이탈 등) 안내.
 * 이 시점의 주문은 PENDING으로 남아 있으며, 재시도 시 새 주문이 생성된다 (T-2 설계).
 */
function FailContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const message = searchParams.get("message");

  // 사용자 취소는 오류가 아니므로 표현을 구분
  const isUserCancel = code === "PAY_PROCESS_CANCELED";

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <h1 className="text-2xl font-bold text-gray-900">
        {isUserCancel ? "결제가 취소되었습니다" : "결제에 실패했습니다"}
      </h1>

      {!isUserCancel && (
        <p
          className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {message ?? "결제 처리 중 오류가 발생했습니다."}
          {code && <span className="mt-1 block text-xs text-red-400">오류 코드: {code}</span>}
        </p>
      )}

      <p className="mt-3 text-sm text-gray-500">
        결제 금액은 청구되지 않았습니다. 아래 버튼으로 다시 시도하실 수 있습니다.
      </p>

      <Link
        href="/checkout"
        className="mt-8 inline-block rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
      >
        주문서로 돌아가기
      </Link>
    </div>
  );
}

export default function PaymentFailPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
          <Suspense fallback={<p className="py-12 text-center text-gray-500">불러오는 중...</p>}>
            <FailContent />
          </Suspense>
        </section>
      </main>
      <Footer />
    </div>
  );
}
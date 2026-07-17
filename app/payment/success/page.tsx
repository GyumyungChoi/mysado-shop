"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { useCartCount } from "@/components/CartCountProvider";

interface ConfirmResponse {
  orderId: string;
  orderName: string;
  totalAmount: number;
  alreadyPaid: boolean;
}

/**
 * 토스 successUrl 랜딩 페이지 — 쿼리의 paymentKey/orderId/amount를
 * 서버 confirm API로 전달하고 결과를 표시한다. (검증은 전부 서버 담당)
 * useSearchParams 사용으로 Suspense 래핑 필수 (Next.js 14 규칙)
 */
function SuccessContent() {
  const searchParams = useSearchParams();
  const { refreshCartCount } = useCartCount();

  const [phase, setPhase] = useState<"confirming" | "done" | "error">("confirming");
  const [result, setResult] = useState<ConfirmResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** StrictMode 이펙트 2회 실행으로 confirm이 중복 호출되는 것 방지 */
  const confirmStarted = useRef(false);

  useEffect(() => {
    if (confirmStarted.current) return;
    confirmStarted.current = true;

    const paymentKey = searchParams.get("paymentKey");
    const orderId = searchParams.get("orderId");
    const amount = searchParams.get("amount");

    if (!paymentKey || !orderId || !amount) {
      setPhase("error");
      setErrorMessage("결제 정보가 올바르지 않습니다. 처음부터 다시 시도해주세요.");
      return;
    }

    (async () => {
      try {
        const response = await fetch("/api/payment/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
        });

        const data = (await response.json()) as ConfirmResponse & { message?: string };

        if (!response.ok) {
          setPhase("error");
          setErrorMessage(data.message ?? "결제 승인에 실패했습니다.");
          return;
        }

        setResult(data);
        setPhase("done");
        // 설계 결정 ⑥: confirm 성공 시 헤더 장바구니 뱃지 갱신
        void refreshCartCount();
      } catch {
        setPhase("error");
        setErrorMessage("결제 승인 중 오류가 발생했습니다. 주문 내역을 확인해주세요.");
      }
    })();
  }, [searchParams, refreshCartCount]);

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      {phase === "confirming" && (
        <>
          <h1 className="text-2xl font-bold text-gray-900">결제를 승인하고 있습니다</h1>
          <p className="mt-3 text-sm text-gray-500">
            잠시만 기다려주세요. 이 화면을 닫지 마세요.
          </p>
        </>
      )}

      {phase === "done" && result && (
        <>
          <h1 className="text-2xl font-bold text-gray-900">결제가 완료되었습니다</h1>
          <p className="mt-3 text-sm text-gray-500">
            주문 확인 메일을 보내드렸습니다. 감사합니다!
          </p>
          <dl className="mt-8 space-y-3 rounded-xl bg-gray-50 p-5 text-left text-sm">
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-gray-500">주문명</dt>
              <dd className="font-medium text-gray-900">{result.orderName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-gray-500">주문번호</dt>
              <dd className="break-all font-mono text-xs text-gray-700">{result.orderId}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-gray-500">결제 금액</dt>
              <dd className="font-bold text-gray-900">
                {result.totalAmount.toLocaleString("ko-KR")}원
              </dd>
            </div>
          </dl>
          <Link
            href="/products"
            className="mt-8 inline-block rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
          >
            쇼핑 계속하기
          </Link>
        </>
      )}

      {phase === "error" && (
        <>
          <h1 className="text-2xl font-bold text-gray-900">결제 승인에 실패했습니다</h1>
          <p
            className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {errorMessage}
          </p>
          <p className="mt-3 text-xs text-gray-500">
            결제 금액이 청구된 경우 자동으로 취소됩니다.
          </p>
          <Link
            href="/checkout"
            className="mt-8 inline-block rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
          >
            주문서로 돌아가기
          </Link>
        </>
      )}
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
          <Suspense fallback={<p className="py-12 text-center text-gray-500">불러오는 중...</p>}>
            <SuccessContent />
          </Suspense>
        </section>
      </main>
      <Footer />
    </div>
  );
}
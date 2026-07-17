"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  loadTossPayments,
  type TossPaymentsWidgets,
} from "@tosspayments/tosspayments-sdk";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { useSession } from "@/lib/auth-client";

/** GET /api/cart 응답 항목 (app/cart/page.tsx와 동일 형태) */
interface CartItemView {
  id: number;
  productId: string;
  name: string;
  image: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  stock: number;
  isAvailable: boolean;
}

interface CartView {
  items: CartItemView[];
  totalAmount: number;
  totalCount: number;
}

/** POST /api/orders 성공(201) 응답 (lib/orders.ts의 CreateOrderResult와 동일 형태) */
interface CreateOrderResult {
  orderId: string;
  totalAmount: number;
  orderName: string;
}

/** 토스 SDK가 던지는 에러 형태 (공식 타입 미제공 구간) */
interface TossError {
  code?: string;
  message?: string;
}

/** 주문서 페이지 — 배송지 입력 + 주문 요약 + 결제위젯 (토스페이먼츠 SDK v2) */
export default function CheckoutPage() {
  const router = useRouter();
  const { data: session } = useSession();

  const [cart, setCart] = useState<CartView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /** 결제위젯 인스턴스 — 렌더 완료 후 채워짐 */
  const [widgets, setWidgets] = useState<TossPaymentsWidgets | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  /** React StrictMode의 이펙트 2회 실행으로 위젯이 중복 렌더되는 것 방지 */
  const widgetInitStarted = useRef(false);

  // 배송지 폼 상태 (types/order.ts의 ShippingInfo 필드와 1:1)
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [deliveryMemo, setDeliveryMemo] = useState("");
  /** 연락처 pre-fill을 1회만 수행 (세션 갱신이 사용자 입력을 덮어쓰지 않도록) */
  const [phonePrefilled, setPhonePrefilled] = useState(false);

  /** 주문 요약용 장바구니 조회 (401이면 로그인 페이지로) */
  const loadCart = useCallback(async () => {
    try {
      const response = await fetch("/api/cart");

      if (response.status === 401) {
        router.replace("/login?redirect=/checkout");
        return;
      }
      if (!response.ok) {
        const data = (await response.json()) as { message: string };
        setErrorMessage(data.message);
        return;
      }

      setCart((await response.json()) as CartView);
      setErrorMessage(null);
    } catch {
      setErrorMessage("주문 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  // 세션의 phoneNumber가 도착하면 연락처를 1회만 pre-fill
  useEffect(() => {
    if (phonePrefilled) return;
    const phone = session?.user?.phoneNumber;
    if (phone) {
      setRecipientPhone(phone);
      setPhonePrefilled(true);
    }
  }, [session, phonePrefilled]);

  // 결제위젯 초기화 — 세션(customerKey)과 장바구니(금액)가 모두 준비된 뒤 1회만
  useEffect(() => {
    const userId = session?.user?.id;
    const hasItems =
      (cart?.items.filter((item) => item.isAvailable).length ?? 0) > 0;
    if (!userId || !cart || !hasItems) return;
    if (widgetInitStarted.current) return;
    widgetInitStarted.current = true;

    (async () => {
      try {
        const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
        if (!clientKey) {
          setErrorMessage("결제 설정에 문제가 있습니다. 관리자에게 문의해주세요.");
          return;
        }

        const tossPayments = await loadTossPayments(clientKey);
        const w = tossPayments.widgets({ customerKey: userId });

        // 렌더 전 금액 설정 필수 — 이후 결제 직전에 주문 금액으로 재설정함
        await w.setAmount({ currency: "KRW", value: cart.totalAmount });
        await Promise.all([
          w.renderPaymentMethods({
            selector: "#payment-method",
            variantKey: "DEFAULT",
          }),
          w.renderAgreement({ selector: "#agreement", variantKey: "AGREEMENT" }),
        ]);

        setWidgets(w);
        setWidgetReady(true);
      } catch (error) {
        console.error("[checkout] 결제위젯 초기화 실패:", error);
        setErrorMessage(
          "결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.",
        );
      }
    })();
  }, [session, cart]);

  /**
   * 주문 생성 → 결제위젯 결제 요청.
   * 결제 취소 후 재시도 시 새 주문을 다시 생성함 (배송지 수정 반영 + orderId 재사용 문제 회피).
   * 미결제 PENDING 주문은 무해하며 정리는 admin 단계에서 다룸.
   */
  const submitOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!widgets || !widgetReady) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipping: {
            recipientName,
            recipientPhone,
            zipCode,
            address1,
            // 빈 문자열은 보내지 않음 → 서버에서 undefined ?? null 처리
            address2: address2 || undefined,
            deliveryMemo: deliveryMemo || undefined,
          },
        }),
      });

      if (response.status === 401) {
        router.replace("/login?redirect=/checkout");
        return;
      }
      if (!response.ok) {
        const data = (await response.json()) as { message: string };
        setErrorMessage(data.message);
        return;
      }

      const order = (await response.json()) as CreateOrderResult;

      // 위젯 렌더 시점과 주문 생성 시점 사이의 변동 대비 — 서버 확정 금액으로 재설정
      await widgets.setAmount({ currency: "KRW", value: order.totalAmount });

      // 성공/실패 시 토스가 아래 URL로 리다이렉트 (쿼리로 paymentKey 등 전달)
      await widgets.requestPayment({
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
        customerEmail: session?.user?.email ?? undefined,
        customerName: recipientName || undefined,
      });
      // requestPayment 성공 시 페이지가 이동하므로 이후 코드는 실행되지 않음
    } catch (error) {
      const tossError = error as TossError;
      if (tossError.code === "PAY_PROCESS_CANCELED") {
        setErrorMessage("결제가 취소되었습니다. 다시 시도하실 수 있습니다.");
      } else {
        setErrorMessage(
          tossError.message ?? "결제 요청에 실패했습니다. 잠시 후 다시 시도해주세요.",
        );
      }
      // 에러 메시지가 페이지 상단에 있으므로 보이도록 스크롤 (실측: 미스크롤 시 인지 불가)
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableItems = cart?.items.filter((item) => item.isAvailable) ?? [];
  const excludedCount = (cart?.items.length ?? 0) - availableItems.length;

  const inputClass =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm " +
    "focus:border-gray-900 focus:outline-none";

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">주문서</h1>

          {errorMessage && (
            <p
              className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {errorMessage}
            </p>
          )}

          {isLoading ? (
            <p className="mt-8 text-gray-500">불러오는 중...</p>
          ) : availableItems.length === 0 ? (
            <div className="mt-12 flex flex-col items-center gap-4 py-12">
              <p className="text-gray-500">주문 가능한 상품이 없습니다.</p>
              <Link
                href="/cart"
                className="rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
              >
                장바구니로 돌아가기
              </Link>
            </div>
          ) : (
            <form onSubmit={submitOrder} className="mt-6 grid gap-8 lg:grid-cols-5">
              {/* ── 배송지 입력 ── */}
              <div className="lg:col-span-3">
                <h2 className="text-lg font-semibold text-gray-900">배송지 정보</h2>
                <div className="mt-4 space-y-4">
                  <div>
                    <label htmlFor="recipientName" className="text-sm font-medium text-gray-700">
                      수령인 <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="recipientName"
                      type="text"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      className={inputClass}
                      placeholder="이름"
                      autoComplete="name"
                    />
                  </div>

                  <div>
                    <label htmlFor="recipientPhone" className="text-sm font-medium text-gray-700">
                      연락처 <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="recipientPhone"
                      type="tel"
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      className={inputClass}
                      placeholder="010-0000-0000"
                      autoComplete="tel"
                    />
                  </div>

                  <div>
                    <label htmlFor="zipCode" className="text-sm font-medium text-gray-700">
                      우편번호 <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="zipCode"
                      type="text"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      className={`${inputClass} max-w-[10rem]`}
                      placeholder="5자리 숫자"
                      inputMode="numeric"
                      maxLength={5}
                      autoComplete="postal-code"
                    />
                  </div>

                  <div>
                    <label htmlFor="address1" className="text-sm font-medium text-gray-700">
                      주소 <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="address1"
                      type="text"
                      value={address1}
                      onChange={(e) => setAddress1(e.target.value)}
                      className={inputClass}
                      placeholder="도로명 주소"
                      autoComplete="address-line1"
                    />
                  </div>

                  <div>
                    <label htmlFor="address2" className="text-sm font-medium text-gray-700">
                      상세 주소
                    </label>
                    <input
                      id="address2"
                      type="text"
                      value={address2}
                      onChange={(e) => setAddress2(e.target.value)}
                      className={inputClass}
                      placeholder="동/호수 등 (선택)"
                      autoComplete="address-line2"
                    />
                  </div>

                  <div>
                    <label htmlFor="deliveryMemo" className="text-sm font-medium text-gray-700">
                      배송 메모
                    </label>
                    <input
                      id="deliveryMemo"
                      type="text"
                      value={deliveryMemo}
                      onChange={(e) => setDeliveryMemo(e.target.value)}
                      className={inputClass}
                      placeholder="예: 부재 시 문 앞에 놓아주세요 (선택)"
                    />
                  </div>
                </div>
              </div>

              {/* ── 주문 요약 + 결제위젯 ── */}
              <div className="lg:col-span-2">
                <h2 className="text-lg font-semibold text-gray-900">주문 상품</h2>
                <ul className="mt-4 divide-y divide-gray-200 border-y border-gray-200">
                  {availableItems.map((item) => (
                    <li key={item.id} className="flex items-start gap-3 py-3">
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-50">
                        {item.image && (
                          <Image
                            src={item.image}
                            alt=""
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm text-gray-900">{item.name}</p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {item.unitPrice.toLocaleString("ko-KR")}원 × {item.quantity}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-gray-900">
                        {item.lineTotal.toLocaleString("ko-KR")}원
                      </p>
                    </li>
                  ))}
                </ul>

                {excludedCount > 0 && (
                  <p className="mt-3 text-xs text-red-600">
                    구매할 수 없는 상품 {excludedCount}건은 주문에서 제외됩니다.
                  </p>
                )}

                {/* 토스 결제위젯 렌더 영역 — 결제수단 선택 + 약관 동의 */}
                <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <div id="payment-method" />
                  <div id="agreement" />
                </div>

                <div className="mt-4 rounded-xl bg-gray-50 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">결제 예정 금액</span>
                    <span className="text-xl font-bold text-gray-900">
                      {(cart?.totalAmount ?? 0).toLocaleString("ko-KR")}원
                    </span>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting || !widgetReady}
                    className="mt-4 w-full rounded-lg bg-gray-900 px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-gray-700 disabled:bg-gray-300 disabled:text-gray-500"
                  >
                    {!widgetReady
                      ? "결제 모듈 로딩 중..."
                      : isSubmitting
                        ? "결제 진행 중..."
                        : "결제하기"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
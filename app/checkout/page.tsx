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
import PostcodeSearchButton from "@/components/PostcodeSearchButton";
import { DELIVERY_MEMO_OPTIONS, DELIVERY_MEMO_CUSTOM } from "@/lib/delivery-memo";
import { formatPhone } from "@/lib/format-phone";

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

/** GET /api/mypage/addresses 응답 항목 (AddressList와 동일 형태) */
interface AddressItem {
  id: string;
  label: string | null;
  recipientName: string;
  recipientPhone: string;
  zipCode: string;
  address1: string;
  address2: string | null;
  deliveryMemo: string | null;
  isDefault: boolean;
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
  const [memoCustom, setMemoCustom] = useState(false);
  // 저장 배송지 — 로드 완료 전에는 pre-fill 판단을 보류한다
  const [addresses, setAddresses] = useState<AddressItem[]>([]);
  const [addressesLoaded, setAddressesLoaded] = useState(false);
  /** 선택된 저장 배송지 id. null = 직접 입력 모드 */
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
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

  // 저장 배송지 로드 — 실패해도 직접 입력으로 진행 가능하므로 치명 처리하지 않음
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/mypage/addresses");
        if (res.ok) {
          const json = (await res.json()) as { addresses: AddressItem[] };
          setAddresses(json.addresses);
          // 정렬에 의존하지 않고 isDefault를 명시적으로 찾는다
          const def = json.addresses.find((a) => a.isDefault);
          if (def) {
            setSelectedAddressId(def.id);
            const memo = def.deliveryMemo || "";
            setDeliveryMemo(memo);
            setMemoCustom(memo !== "" && DELIVERY_MEMO_OPTIONS.indexOf(memo) === -1);
          }
        }
      } catch {
        // 무시 — 직접 입력 폼이 기본 경로로 남는다
      } finally {
        setAddressesLoaded(true);
      }
    })();
  }, []);

  /** 배송지 선택 전환 — 메모는 해당 배송지의 기본 메모로 초기화 (주문별 수정 가능) */
  function selectAddress(id: string | null) {
    setSelectedAddressId(id);
    const item = id ? addresses.find((a) => a.id === id) : null;
    const memo = (item && item.deliveryMemo) || "";
    setDeliveryMemo(memo);
    setMemoCustom(memo !== "" && DELIVERY_MEMO_OPTIONS.indexOf(memo) === -1);
  }

  // 저장 배송지가 없을 때만 세션 phoneNumber로 연락처 pre-fill
  // (기본 배송지의 연락처를 세션 값이 덮어쓰지 않도록 목록 로드 완료 후 판단)
  useEffect(() => {
    if (!addressesLoaded || addresses.length > 0) return;
    if (phonePrefilled) return;
    const phone = session?.user?.phoneNumber;
    if (phone) {
      setRecipientPhone(phone);
      setPhonePrefilled(true);
    }
  }, [addressesLoaded, addresses, session, phonePrefilled]);

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

    // 저장 배송지 모드면 선택된 배송지에서, 직접 입력 모드면 폼 state에서 값을 가져온다
    // (필드명이 Address와 동일하므로 매핑 코드 불필요 — 설계 결정 ㊾)
    const selected = selectedAddressId
      ? addresses.find((a) => a.id === selectedAddressId)
      : null;
    const shipping = selected
      ? {
          recipientName: selected.recipientName,
          recipientPhone: selected.recipientPhone,
          zipCode: selected.zipCode,
          address1: selected.address1,
          address2: selected.address2 || undefined,
          deliveryMemo: deliveryMemo || undefined,
        }
      : {
          recipientName,
          recipientPhone,
          zipCode,
          address1,
          // 빈 문자열은 보내지 않음 → 서버에서 undefined ?? null 처리
          address2: address2 || undefined,
          deliveryMemo: deliveryMemo || undefined,
        };

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipping: shipping }),
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
        customerName: shipping.recipientName || undefined,
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
              {/* ── 주문자 · 배송지 ── */}
              <div className="lg:col-span-3">
                <h2 className="text-lg font-semibold text-gray-900">주문자 정보</h2>
                <div className="mt-3 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  <p className="font-medium text-gray-900">{session?.user?.name}</p>
                  <p className="mt-0.5">{session?.user?.email}</p>
                  {session?.user?.phoneNumber ? (
                    <p className="mt-0.5">{formatPhone(session.user.phoneNumber)}</p>
                  ) : null}
                </div>

                <h2 className="mt-8 text-lg font-semibold text-gray-900">배송지 정보</h2>

                {addresses.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {addresses.map((item) => (
                      <label
                        key={item.id}
                        className={
                          "flex cursor-pointer items-start gap-3 rounded-lg border p-4 " +
                          (selectedAddressId === item.id
                            ? "border-gray-900"
                            : "border-gray-200")
                        }
                      >
                        <input
                          type="radio"
                          name="shippingAddress"
                          checked={selectedAddressId === item.id}
                          onChange={() => selectAddress(item.id)}
                          className="mt-1 h-4 w-4"
                        />
                        <span className="min-w-0 text-sm">
                          <span className="flex flex-wrap items-center gap-2 font-semibold text-gray-900">
                            {item.recipientName}
                            {item.label ? (
                              <span className="text-xs font-normal text-gray-500">
                                {item.label}
                              </span>
                            ) : null}
                            {item.isDefault ? (
                              <span className="rounded bg-gray-900 px-1.5 py-0.5 text-xs font-medium text-white">
                                기본
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-1 block text-gray-600">
                            {formatPhone(item.recipientPhone)}
                          </span>
                          <span className="mt-1 block text-gray-600">
                            ({item.zipCode}) {item.address1} {item.address2 || ""}
                          </span>
                        </span>
                      </label>
                    ))}

                    <label
                      className={
                        "flex cursor-pointer items-center gap-3 rounded-lg border p-4 text-sm " +
                        (selectedAddressId === null
                          ? "border-gray-900"
                          : "border-gray-200")
                      }
                    >
                      <input
                        type="radio"
                        name="shippingAddress"
                        checked={selectedAddressId === null}
                        onChange={() => selectAddress(null)}
                        className="h-4 w-4"
                      />
                      <span className="font-medium text-gray-900">
                        다른 곳으로 배송 (직접 입력)
                      </span>
                    </label>
                  </div>
                ) : null}

                {selectedAddressId === null ? (
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
                    <div className="mt-1 flex gap-2">
                      <input
                        id="zipCode"
                        type="text"
                        value={zipCode}
                        readOnly
                        className="w-28 shrink-0 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm"
                        placeholder="우편번호"
                        autoComplete="postal-code"
                      />
                      <PostcodeSearchButton
                        onComplete={(r) => {
                          setZipCode(r.zipCode);
                          setAddress1(r.address1);
                        }}
                        onError={setErrorMessage}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="address1" className="text-sm font-medium text-gray-700">
                      주소 <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="address1"
                      type="text"
                      value={address1}
                      readOnly
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm"
                      placeholder="우편번호 찾기로 입력됩니다"
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

                </div>
                ) : null}

                {/* 배송 메모 — 두 모드 공통. 선택 배송지의 기본 메모로 초기화되며 주문별 수정 가능 */}
                <div className="mt-6">
                  <label htmlFor="deliveryMemo" className="text-sm font-medium text-gray-700">
                    배송 메모
                  </label>
                  <select
                    id="deliveryMemo"
                    value={memoCustom ? DELIVERY_MEMO_CUSTOM : deliveryMemo}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === DELIVERY_MEMO_CUSTOM) {
                        setMemoCustom(true);
                        setDeliveryMemo("");
                      } else {
                        setMemoCustom(false);
                        setDeliveryMemo(v);
                      }
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-gray-900 focus:outline-none"
                  >
                    <option value="">선택 안 함</option>
                    {DELIVERY_MEMO_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                    <option value={DELIVERY_MEMO_CUSTOM}>직접 입력</option>
                  </select>
                  {memoCustom ? (
                    <input
                      type="text"
                      value={deliveryMemo}
                      onChange={(e) => setDeliveryMemo(e.target.value)}
                      autoComplete="off"
                      placeholder="예: 공동현관 비밀번호 1234#"
                      className={inputClass}
                    />
                  ) : null}
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
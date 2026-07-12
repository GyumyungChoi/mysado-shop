"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

/** GET /api/cart 응답 항목 (lib/cart.ts의 CartItemView와 동일 형태) */
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

/** 장바구니 페이지 — 목록/수량변경/삭제/합계 (주문 버튼은 Step 3에서 활성화) */
export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** 수량변경/삭제 진행 중인 항목 id (해당 행 버튼만 비활성화) */
  const [busyItemId, setBusyItemId] = useState<number | null>(null);

  /** 장바구니 다시 불러오기 (401이면 로그인 페이지로) */
  const loadCart = useCallback(async () => {
    try {
      const response = await fetch("/api/cart");

      if (response.status === 401) {
        router.replace("/login?redirect=/cart");
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
      setErrorMessage("장바구니를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  /** 수량 변경 (PATCH) 후 목록 갱신 */
  const changeQuantity = async (item: CartItemView, delta: number) => {
    const newQuantity = item.quantity + delta;
    if (newQuantity < 1 || newQuantity > item.stock) return;

    setBusyItemId(item.id);
    try {
      const response = await fetch(`/api/cart/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: newQuantity }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { message: string };
        setErrorMessage(data.message);
        return;
      }

      await loadCart();
    } catch {
      setErrorMessage("수량 변경에 실패했습니다.");
    } finally {
      setBusyItemId(null);
    }
  };

  /** 항목 삭제 (DELETE) 후 목록 갱신 */
  const removeItem = async (item: CartItemView) => {
    setBusyItemId(item.id);
    try {
      const response = await fetch(`/api/cart/${item.id}`, { method: "DELETE" });

      if (!response.ok) {
        const data = (await response.json()) as { message: string };
        setErrorMessage(data.message);
        return;
      }

      await loadCart();
    } catch {
      setErrorMessage("삭제에 실패했습니다.");
    } finally {
      setBusyItemId(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            장바구니
          </h1>

          {errorMessage && (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {errorMessage}
            </p>
          )}

          {isLoading ? (
            <p className="mt-8 text-gray-500">불러오는 중...</p>
          ) : !cart || cart.items.length === 0 ? (
            <div className="mt-12 flex flex-col items-center gap-4 py-12">
              <p className="text-gray-500">장바구니가 비어 있습니다.</p>
              <Link
                href="/products"
                className="rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
              >
                상품 보러 가기
              </Link>
            </div>
          ) : (
            <>
              {/* 항목 목록 */}
              <ul className="mt-6 divide-y divide-gray-200 border-y border-gray-200">
                {cart.items.map((item) => (
                  <li key={item.id} className="flex gap-4 py-5">
                    {/* 상품 이미지 */}
                    <Link
                      href={`/products/${item.productId}`}
                      className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-50 sm:h-24 sm:w-24"
                    >
                      {item.image && (
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          sizes="96px"
                          className="object-cover"
                        />
                      )}
                    </Link>

                    {/* 상품 정보 + 조작 */}
                    <div className="flex flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/products/${item.productId}`}
                          className="line-clamp-2 text-sm font-medium text-gray-900 hover:underline sm:text-base"
                        >
                          {item.name}
                        </Link>
                        <button
                          type="button"
                          onClick={() => removeItem(item)}
                          disabled={busyItemId === item.id}
                          className="shrink-0 text-sm text-gray-400 hover:text-gray-600 disabled:opacity-50"
                          aria-label={`${item.name} 삭제`}
                        >
                          삭제
                        </button>
                      </div>

                      {!item.isAvailable && (
                        <p className="mt-1 text-xs font-medium text-red-600">
                          현재 구매할 수 없는 상품입니다 (합계 제외)
                        </p>
                      )}

                      <div className="mt-auto flex items-center justify-between pt-3">
                        {/* 수량 조절 */}
                        <div className="flex items-center rounded-lg border border-gray-300">
                          <button
                            type="button"
                            onClick={() => changeQuantity(item, -1)}
                            disabled={busyItemId === item.id || item.quantity <= 1}
                            className="px-3 py-1.5 text-gray-600 disabled:text-gray-300"
                            aria-label="수량 감소"
                          >
                            −
                          </button>
                          <span className="min-w-[2.5rem] text-center text-sm font-medium">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => changeQuantity(item, 1)}
                            disabled={busyItemId === item.id || item.quantity >= item.stock}
                            className="px-3 py-1.5 text-gray-600 disabled:text-gray-300"
                            aria-label="수량 증가"
                          >
                            +
                          </button>
                        </div>

                        {/* 금액 */}
                        <div className="text-right">
                          <p className="text-sm text-gray-500">
                            {item.unitPrice.toLocaleString("ko-KR")}원 × {item.quantity}
                          </p>
                          <p className="text-base font-bold text-gray-900">
                            {item.lineTotal.toLocaleString("ko-KR")}원
                          </p>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* 합계 + 주문 버튼 */}
              <div className="mt-6 rounded-xl bg-gray-50 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-base font-medium text-gray-700">
                    총 결제 예정 금액
                  </span>
                  <span className="text-2xl font-bold text-gray-900">
                    {cart.totalAmount.toLocaleString("ko-KR")}원
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/checkout")}
                  disabled={!cart.items.some((item) => item.isAvailable)}
                  className="mt-4 w-full rounded-lg bg-gray-900 px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-gray-700 disabled:bg-gray-300 disabled:text-gray-500"
                >
                  주문하기
                </button>
              </div>
            </>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}

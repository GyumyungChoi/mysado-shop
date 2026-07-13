"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCartCount } from "@/components/CartCountProvider";

interface AddToCartButtonProps {
  productId: string;
  stock: number;
  /** 판매중(SALE) + 노출중일 때만 true — 서버 컴포넌트에서 계산해 전달 */
  isPurchasable: boolean;
}

/** 상품 상세의 수량 선택 + 장바구니 담기 버튼 (로그인 필요, 401이면 로그인 페이지로) */
export default function AddToCartButton({
  productId,
  stock,
  isPurchasable,
}: AddToCartButtonProps) {
  const router = useRouter();
  const { refreshCartCount } = useCartCount();
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /** 수량 증감 — 1 이상, 재고 이하로 제한 */
  const changeQuantity = (delta: number) => {
    setQuantity((prev) => Math.min(Math.max(prev + delta, 1), stock));
  };

  const handleAddToCart = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity }),
      });

      if (response.status === 401) {
        // 비로그인 → 로그인 페이지로 (돌아올 수 있게 현재 경로 전달)
        router.push(`/login?redirect=/products/${productId}`);
        return;
      }

      const data = (await response.json()) as { message: string };

      if (!response.ok) {
        setMessage(data.message);
        return;
      }

      setMessage("장바구니에 담았습니다.");
      void refreshCartCount();
    } catch {
      setMessage("잠시 후 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isPurchasable) {
    return (
      <div className="mt-8 flex w-full items-center justify-center rounded-lg bg-gray-200 px-6 py-4 text-base font-semibold text-gray-500">
        현재 구매할 수 없는 상품입니다
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex items-center gap-3">
        {/* 수량 선택 */}
        <div className="flex items-center rounded-lg border border-gray-300">
          <button
            type="button"
            onClick={() => changeQuantity(-1)}
            disabled={quantity <= 1}
            className="px-4 py-3 text-lg text-gray-600 disabled:text-gray-300"
            aria-label="수량 감소"
          >
            −
          </button>
          <span className="min-w-[3rem] text-center text-base font-medium">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => changeQuantity(1)}
            disabled={quantity >= stock}
            className="px-4 py-3 text-lg text-gray-600 disabled:text-gray-300"
            aria-label="수량 증가"
          >
            +
          </button>
        </div>

        {/* 담기 버튼 */}
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={isLoading}
          className="flex flex-1 items-center justify-center rounded-lg bg-gray-900 px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-gray-700 disabled:bg-gray-400"
        >
          {isLoading ? "담는 중..." : "장바구니 담기"}
        </button>
      </div>

      {message && (
        <p className="mt-2 text-sm text-gray-600" role="status">
          {message}{" "}
          {message === "장바구니에 담았습니다." && (
            <button
              type="button"
              onClick={() => router.push("/cart")}
              className="font-semibold text-blue-600 underline"
            >
              장바구니 보기
            </button>
          )}
        </p>
      )}
    </div>
  );
}

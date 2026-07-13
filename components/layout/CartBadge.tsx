"use client";

import { useCartCount } from "@/components/CartCountProvider";

/** 헤더 장바구니 아이콘 위 수량 뱃지 (설계 결정 ⑥)
 *  0이면 숨김, 1~99 숫자, 100 이상 "99+" */
export default function CartBadge() {
  const { count } = useCartCount();

  if (count === 0) {
    return null;
  }

  return (
    <span
      aria-label={`장바구니 ${count}개`}
      className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useSession } from "@/lib/auth-client";

/** 뱃지 값과 갱신 함수를 전역 제공하는 Context (설계 결정 ⑥) */
interface CartCountContextValue {
  /** 장바구니 총 수량 합계 (구매불가 항목 포함) */
  count: number;
  /** 장바구니 변동 후 호출 — 서버에서 다시 계산 */
  refreshCartCount: () => Promise<void>;
}

const CartCountContext = createContext<CartCountContextValue | null>(null);

export function CartCountProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const [count, setCount] = useState(0);

  const refreshCartCount = useCallback(async () => {
    // 비로그인이면 API 호출 없이 0 (스펙: 숨김)
    if (!session?.user) {
      setCount(0);
      return;
    }

    try {
      const response = await fetch("/api/cart");
      if (!response.ok) {
        // 401 등 — 뱃지는 조용히 숨김 (오류 UI는 뱃지 책임 아님)
        setCount(0);
        return;
      }
      const data = (await response.json()) as {
        items: { quantity: number }[];
      };
      // totalCount는 "줄 수"이므로 쓰지 않고 수량을 직접 합산
      setCount(data.items.reduce((sum, item) => sum + item.quantity, 0));
    } catch {
      // 네트워크 오류 — 기존 값 유지 (깜빡임 방지)
    }
  }, [session?.user]);

  // 마운트 시 1회 + 로그인/로그아웃(세션 변화) 시 자동 갱신
  useEffect(() => {
    void refreshCartCount();
  }, [refreshCartCount]);

  return (
    <CartCountContext.Provider value={{ count, refreshCartCount }}>
      {children}
    </CartCountContext.Provider>
  );
}

/** 뱃지/버튼에서 사용하는 훅 — Provider 밖에서 쓰면 즉시 에러로 알림 */
export function useCartCount() {
  const context = useContext(CartCountContext);
  if (!context) {
    throw new Error("useCartCount는 CartCountProvider 안에서만 사용할 수 있습니다.");
  }
  return context;
}

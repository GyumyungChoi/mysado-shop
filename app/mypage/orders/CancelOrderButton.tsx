"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 주문 취소 버튼 (PAID 상태 주문에만 렌더됨 — 노출 조건은 서버 페이지가 결정)
 * POST /api/payment/cancel 호출 → 성공 시 router.refresh()로 서버 컴포넌트 재조회
 */
export default function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCancel() {
    // confirm: 브라우저 기본 확인창 — 실수 클릭 방어
    if (!window.confirm("이 주문을 취소하시겠습니까?\n결제 금액이 전액 환불됩니다.")) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/payment/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 서버가 내려준 message 우선 (401/404/409/400 모두 message 포함)
        setError(data.message ?? "취소에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      // 성공(alreadyCanceled 포함) → 서버 컴포넌트 데이터 재조회로 상태 갱신
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleCancel}
        disabled={loading}
        className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {loading ? "취소 처리 중..." : "주문 취소"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

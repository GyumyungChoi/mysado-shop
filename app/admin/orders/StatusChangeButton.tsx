"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * admin 주문 상태 전환 버튼 (다음 상태가 있는 주문에만 렌더 — 노출 조건은 서버 페이지가 결정)
 * PATCH /api/admin/orders/[orderId]/status 호출 → 성공 시 router.refresh()
 * 전환 규칙의 최종 검증은 서버 API — 본 컴포넌트는 표시·호출만 담당
 */
export default function StatusChangeButton({
  orderId,
  nextStatus,
  nextLabel,
}: {
  orderId: string;
  nextStatus: string; // 예: "PREPARING"
  nextLabel: string;  // 예: "상품 준비 중"
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleChange() {
    if (!window.confirm(`이 주문을 "${nextLabel}" 상태로 전환하시겠습니까?`)) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 403/404/409/400 모두 서버 message 포함
        setError(data.message ?? "상태 전환에 실패했습니다.");
        return;
      }
      router.refresh(); // 서버 컴포넌트 재조회 → 목록·뱃지 갱신
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
        onClick={handleChange}
        disabled={loading}
        className="rounded border border-blue-300 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50"
      >
        {loading ? "전환 처리 중..." : `${nextLabel}(으)로 전환`}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

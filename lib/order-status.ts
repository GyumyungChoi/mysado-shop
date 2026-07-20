import type { OrderStatus } from "@prisma/client";

// 주문 상태 라벨·색 공용 정의 (24차 추출 — 3곳째 사용처 발생 규칙)
// 사용처: app/admin/orders, app/mypage/orders, app/mypage(허브 카드)
// 상태 추가 시 여기만 갱신하면 전 화면 동기화 — 누락은 Record 전수 요구로 tsc가 검출

// 상태 -> 한글 라벨 (Record 제네릭은 한 줄 유지: heredoc 멀티라인 취약점 회피)
export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "결제 대기",
  PAID: "결제 완료",
  PREPARING: "상품 준비 중",
  SHIPPING: "배송 중",
  DONE: "배송 완료",
  FAILED: "결제 실패",
  CANCELED: "취소됨",
};

// 상태별 뱃지 색 (기본 회색, 의미 있는 상태만 구분)
export const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING: "bg-gray-100 text-gray-600",
  PAID: "bg-blue-50 text-blue-700",
  PREPARING: "bg-blue-50 text-blue-700",
  SHIPPING: "bg-blue-50 text-blue-700",
  DONE: "bg-green-50 text-green-700",
  FAILED: "bg-red-50 text-red-600",
  CANCELED: "bg-gray-100 text-gray-500",
};

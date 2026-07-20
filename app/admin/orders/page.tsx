import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@prisma/client";
import { STATUS_LABEL, STATUS_COLOR } from "@/lib/order-status";
import { requireAdminPage } from "@/lib/admin-guard";
import StatusChangeButton from "./StatusChangeButton";

// admin 주문 목록 — Phase 5 (26.07.18)
// 접근 제어: middleware(1차) + requireAdminPage(2차)
export const dynamic = "force-dynamic";

// UI 노출용 다음 상태 매핑 — 최종 검증은 서버 API (어긋나도 409로 차단됨)
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  PAID: "PREPARING",
  PREPARING: "SHIPPING",
  SHIPPING: "DONE",
};

// 필터 탭 순서 (운영 흐름 순)
const FILTER_TABS: OrderStatus[] = ["PENDING", "PAID", "PREPARING", "SHIPPING", "DONE", "FAILED", "CANCELED"];

// searchParams.status가 enum 값인지 검증 (임의 문자열 → 전체 보기)
function parseStatus(value: string | undefined): OrderStatus | undefined {
  return FILTER_TABS.includes(value as OrderStatus) ? (value as OrderStatus) : undefined;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  await requireAdminPage(); // 비로그인 → /login, 비admin → /

  const statusFilter = parseStatus(searchParams.status);

  const orders = await prisma.order.findMany({
    where: statusFilter ? { status: statusFilter } : undefined,
    include: {
      items: true,
      user: { select: { name: true, email: true } }, // 주문자 표시용 최소 필드
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">주문 관리</h1>
        <span className="text-sm text-gray-500">{orders.length}건</span>
      </div>

      {/* 상태 필터 탭 */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/admin/orders"
          className={
            "rounded-full border px-3 py-1 text-sm " +
            (!statusFilter ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-50")
          }
        >
          전체
        </Link>
        {FILTER_TABS.map((s) => (
          <Link
            key={s}
            href={"/admin/orders?status=" + s}
            className={
              "rounded-full border px-3 py-1 text-sm " +
              (statusFilter === s ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-50")
            }
          >
            {STATUS_LABEL[s]}
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
          해당 상태의 주문이 없습니다.
        </div>
      ) : (
        <ul className="space-y-4">
          {orders.map((order) => (
            <li key={order.id} className="rounded-lg border border-gray-200 p-5">
              {/* 헤더: 주문일시 + 주문자 + 상태 뱃지 */}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-gray-500">
                  <span>{new Date(order.createdAt).toLocaleString("ko-KR")}</span>
                  <span className="mx-2 text-gray-300">|</span>
                  <span className="font-medium text-gray-700">{order.user.name}</span>
                  <span className="ml-1">({order.user.email})</span>
                </div>
                <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + STATUS_COLOR[order.status]}>
                  {STATUS_LABEL[order.status]}
                </span>
              </div>

              {/* 항목 스냅샷 */}
              <ul className="mb-3 space-y-1 text-sm">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between">
                    <span>
                      {item.productName}{" "}
                      <span className="text-gray-400">x{item.quantity}</span>
                    </span>
                    <span>{(item.unitPrice * item.quantity).toLocaleString("ko-KR")}원</span>
                  </li>
                ))}
              </ul>

              {/* 합계 + 배송지 */}
              <div className="flex justify-between border-t border-gray-100 pt-3 text-sm font-medium">
                <span>총 결제 금액</span>
                <span>{order.totalAmount.toLocaleString("ko-KR")}원</span>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {order.recipientName} / {order.recipientPhone} / ({order.zipCode}) {order.address1} {order.address2 ?? ""}
              </p>

              <p className="mt-2 text-xs text-gray-400">
                주문번호 {order.orderNumber ?? order.id}
              </p>
              {NEXT_STATUS[order.status] && (
                <StatusChangeButton
                  orderId={order.id}
                  nextStatus={NEXT_STATUS[order.status]!}
                  nextLabel={STATUS_LABEL[NEXT_STATUS[order.status]!]}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
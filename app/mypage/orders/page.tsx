import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STATUS_LABEL, STATUS_COLOR } from "@/lib/order-status";
import { formatDateTime } from "@/lib/format-date";
import CancelOrderButton from "./CancelOrderButton";

// 주문 데이터는 항상 최신 상태여야 함 (취소 직후 refresh 반영) — 캐싱 차단
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  // 2차 검증: middleware(쿠키 존재)와 별개로 DB 세션 유효성 확인
  const session = await auth.api.getSession({
    headers: headers(),
  });

  if (!session) {
    redirect("/login");
  }

  // @@index([userId, createdAt]) 활용 — 내 주문 최신순 + 항목 스냅샷 포함
  const orders = await prisma.order.findMany({
    where: { userId: session.user.id },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">주문 내역</h1>
        <Link href="/mypage" className="text-sm text-gray-500 hover:underline">
          마이페이지로
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
          주문 내역이 없습니다.
        </div>
      ) : (
        <ul className="space-y-4">
          {orders.map((order) => (
            <li key={order.id} className="rounded-lg border border-gray-200 p-5">
              {/* 헤더: 주문일 + 상태 뱃지 */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {formatDateTime(order.createdAt)}
                </span>
                <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + STATUS_COLOR[order.status]}>
                  {STATUS_LABEL[order.status]}
                </span>
              </div>

              {/* 주문 항목 (스냅샷 — 상품 삭제/가격 변경과 무관) */}
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

              {/* 합계 */}
              <div className="flex justify-between border-t border-gray-100 pt-3 text-sm font-medium">
                <span>총 결제 금액</span>
                <span>{order.totalAmount.toLocaleString("ko-KR")}원</span>
              </div>

              {/* 취소 버튼: API가 PAID만 허용하므로 UI 노출 조건도 일치 */}
              {order.status === "PAID" && <CancelOrderButton orderId={order.id} />}

              {/* 주문번호 (문의 대응용 — cuid라 작게 표시) */}
              <p className="mt-3 text-xs text-gray-400">주문번호 {order.orderNumber ?? order.id}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

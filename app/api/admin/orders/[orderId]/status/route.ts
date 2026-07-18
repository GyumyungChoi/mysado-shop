// admin 주문 상태 전환 API — Phase 5 (26.07.18)
// PATCH /api/admin/orders/[orderId]/status  body: { status: "PREPARING" 등 }
// 순방향 전환만 허용 (PAID→PREPARING→SHIPPING→DONE) + admin_audit_log 기록
import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/admin-guard";

/** 현재 상태 → 허용되는 다음 상태 (서버 측 화이트리스트가 유일한 진실) */
const ALLOWED_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PAID: ["PREPARING"],
  PREPARING: ["SHIPPING"],
  SHIPPING: ["DONE"],
  // PENDING: 결제 파이프라인 전용 — admin 수동 전환 불가
  // DONE / FAILED / CANCELED: 종착 상태 — 열람 전용
};

export async function PATCH(
  request: Request,
  { params }: { params: { orderId: string } }
) {
  const session = await requireAdminApi();
  if (!session) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });
  }

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  // 요청 값을 enum 화이트리스트로 검증 (미검증 문자열의 Prisma 전달 차단)
  const nextStatus = Object.values(OrderStatus).find((s) => s === body.status);
  if (!nextStatus) {
    return NextResponse.json({ message: "유효하지 않은 상태 값입니다." }, { status: 400 });
  }

  try {
    // 조회→검증→변경→감사기록을 한 트랜잭션으로 (검증과 변경 사이 상태 변화 차단)
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: params.orderId },
        select: { id: true, status: true, orderNumber: true },
      });
      if (!order) {
        return { error: 404 as const, message: "주문을 찾을 수 없습니다." };
      }

      const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
      if (!allowed.includes(nextStatus)) {
        return {
          error: 409 as const,
          message: `${order.status} → ${nextStatus} 전환은 허용되지 않습니다.`,
        };
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: { status: nextStatus },
        select: { id: true, status: true, orderNumber: true },
      });

      await tx.adminAuditLog.create({
        data: {
          adminId: session.user.id,
          adminEmail: session.user.email,
          action: "ORDER_STATUS_CHANGE",
          targetType: "Order",
          targetId: order.id,
          fromValue: order.status,
          toValue: nextStatus,
        },
      });

      return { error: null, order: updated };
    });

    if (result.error) {
      return NextResponse.json({ message: result.message }, { status: result.error });
    }
    return NextResponse.json(result.order);
  } catch (error) {
    console.error("[admin/orders/status] PATCH 실패:", error);
    return NextResponse.json({ message: "상태 전환에 실패했습니다." }, { status: 500 });
  }
}
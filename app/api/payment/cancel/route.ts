import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/api-helpers";
import { cancelTossPayment, PAYMENT_LOG_TYPE } from "@/lib/payment";

interface CancelRequestBody {
  orderId?: string;
  cancelReason?: string;
}

/**
 * POST /api/payment/cancel — 결제 전액 취소 (T-5)
 *
 * 현 단계는 API만 제공 (실사용 UI는 admin/마이페이지 단계로 이연).
 *
 * 보안 순서:
 *  1. 로그인 확인 + 주문 소유자 확인
 *  2. CANCELED면 성공 재응답 (멱등 — 중복 요청 대응)
 *  3. PAID 상태만 취소 허용 (그 외 409)
 *  4. 토스 취소 API 호출 (Idempotency-Key: cancel- prefix)
 *  5. 성공 시 트랜잭션: CANCELED 전환 + PaymentLog(CANCEL, payload 원문)
 *     실패 시 CANCEL 로그(실패 원문)만 기록, 주문은 PAID 유지
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CancelRequestBody;
  const { orderId } = body;
  // 취소 사유는 토스 필수 파라미터 — 미입력 시 기본값
  const cancelReason = body.cancelReason?.trim() || "구매자 취소 요청";

  if (!orderId) {
    return NextResponse.json({ message: "주문 정보가 올바르지 않습니다." }, { status: 400 });
  }

  // ── 1. 주문 조회 + 소유자 확인 ──
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order || order.userId !== userId) {
    return NextResponse.json({ message: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  // ── 2. 멱등성: 이미 취소된 주문의 재요청은 성공으로 응답 ──
  if (order.status === "CANCELED") {
    return NextResponse.json({
      orderId: order.id,
      status: "CANCELED",
      alreadyCanceled: true,
    });
  }

  // ── 3. PAID 상태만 취소 가능 ──
  if (order.status !== "PAID") {
    return NextResponse.json(
      { message: "취소할 수 없는 주문 상태입니다." },
      { status: 409 },
    );
  }

  // PAID인데 paymentKey가 없으면 데이터 정합성 이상 (정상 흐름에선 불가능)
  if (!order.paymentKey) {
    return NextResponse.json(
      { message: "결제 정보가 없어 취소할 수 없습니다. 관리자에게 문의해주세요." },
      { status: 409 },
    );
  }

  // ── 4. 토스 취소 API 호출 ──
  const result = await cancelTossPayment({
    paymentKey: order.paymentKey,
    cancelReason,
  });

  if (!result.ok) {
    // 취소 실패 — 주문은 PAID 유지 (사실 상태 보존), 실패 원문만 기록
    await prisma.paymentLog.create({
      data: {
        orderId: order.id,
        type: PAYMENT_LOG_TYPE.CANCEL,
        paymentKey: order.paymentKey,
        payload: (result.raw as object) ?? { code: result.code, failed: true },
      },
    });
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  // ── 5. 취소 성공 — 트랜잭션으로 상태 전환 + 로그 ──
  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELED" },
    }),
    prisma.paymentLog.create({
      data: {
        orderId: order.id,
        type: PAYMENT_LOG_TYPE.CANCEL,
        paymentKey: order.paymentKey,
        payload: result.payment as object,
      },
    }),
  ]);

  return NextResponse.json({
    orderId: order.id,
    status: "CANCELED",
    alreadyCanceled: false,
  });
}
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/api-helpers";
import { confirmTossPayment, PAYMENT_LOG_TYPE } from "@/lib/payment";
import { sendEmail } from "@/lib/email";

interface ConfirmRequestBody {
  paymentKey?: string;
  orderId?: string;
  amount?: number;
}

/**
 * POST /api/payment/confirm — 토스 결제 최종 승인 (01_payment.md 흐름 4~5)
 *
 * 보안 순서 (절대 규칙):
 *  1. 로그인 확인 + 주문 소유자 확인
 *  2. amount == DB 주문금액 재검증 (불일치 시 승인 요청 자체를 안 함)
 *  3. 토스 승인 API 호출 (Idempotency-Key 포함)
 *  4. 트랜잭션: 주문 PAID 전환 + PaymentLog 기록(③) + 주문 상품만 장바구니에서 삭제(⑤)
 *  5. 주문 확인 메일 발송 (실패해도 결제 결과에 영향 없음)
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as ConfirmRequestBody;
  const { paymentKey, orderId } = body;
  const amount = Number(body.amount);

  if (!paymentKey || !orderId || !Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ message: "결제 정보가 올바르지 않습니다." }, { status: 400 });
  }

  // ── 1. 주문 조회 + 소유자 확인 ──
  // 토스 orderId 전환(28차) — 신규 주문은 MYSADO-..., 전환 이전 주문은 cuid
  // 전환 폴백: Phase 8 라이브 후 cuid 분기 제거 예정
  const order = await prisma.order.findUnique({
    where: orderId.startsWith("MYSADO-")
      ? { orderNumber: orderId }
      : { id: orderId },
    include: { items: { select: { productId: true, productName: true } } },
  });

  if (!order || order.userId !== userId) {
    return NextResponse.json({ message: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  // 고객용 주문번호 — 도입(20차) 이전 주문은 null일 수 있어 내부 id로 폴백
  const orderNumber = order.orderNumber ?? order.id;

  // 이미 승인된 주문의 재요청(새로고침 등)은 성공으로 응답 — 멱등성
  if (order.status === "PAID") {
    return NextResponse.json({
      orderId: order.id,
      orderNumber: orderNumber,
      orderName: buildOrderName(order.items.map((i) => i.productName)),
      totalAmount: order.totalAmount,
      alreadyPaid: true,
    });
  }

  if (order.status !== "PENDING") {
    return NextResponse.json(
      { message: "결제를 진행할 수 없는 주문 상태입니다." },
      { status: 409 },
    );
  }

  // ── 2. 금액 재검증 — 클라이언트 조작 차단의 핵심 ──
  if (amount !== order.totalAmount) {
    await prisma.paymentLog.create({
      data: {
        orderId: order.id,
        type: PAYMENT_LOG_TYPE.CONFIRM_FAIL,
        paymentKey,
        payload: { reason: "AMOUNT_MISMATCH", requested: amount, expected: order.totalAmount },
      },
    });
    return NextResponse.json(
      { message: "결제 금액이 주문 금액과 일치하지 않습니다." },
      { status: 400 },
    );
  }

  // ── 3. 토스 승인 API 호출 ──
  const result = await confirmTossPayment({ paymentKey, orderId, amount });

  if (!result.ok) {
    await prisma.$transaction([
      prisma.paymentLog.create({
        data: {
          orderId: order.id,
          type: PAYMENT_LOG_TYPE.CONFIRM_FAIL,
          paymentKey,
          payload: result.raw as object ?? { code: result.code },
        },
      }),
      prisma.order.update({
        where: { id: order.id },
        data: { status: "FAILED" },
      }),
    ]);
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  // ── 4. 승인 성공 — 트랜잭션으로 상태 전환 ──
  // OrderItem.productId는 nullable (상품 삭제 후에도 주문 이력 보존) — null 제외
  const orderedProductIds = order.items
    .map((item) => item.productId)
    .filter((id): id is string => id !== null);

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        paymentKey,
        paidAt: result.payment.approvedAt
          ? new Date(result.payment.approvedAt)
          : new Date(),
      },
    }),
    prisma.paymentLog.create({
      data: {
        orderId: order.id,
        type: PAYMENT_LOG_TYPE.CONFIRM_SUCCESS,
        paymentKey,
        payload: result.payment as object,
      },
    }),
    // 설계 결정 ⑤: 장바구니 삭제는 confirm 성공 시점 — 주문에 포함된 상품만
    prisma.cartItem.deleteMany({
      where: { userId, productId: { in: orderedProductIds } },
    }),
  ]);

  // ── 5. 주문 확인 메일 — 실패해도 결제 성공에 영향 없음 (lib/email.ts는 throw하지 않음) ──
  const orderName = buildOrderName(order.items.map((i) => i.productName));
  const userEmail = (
    await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  )?.email;

  if (userEmail) {
    void sendEmail({
      to: userEmail,
      subject: `[마이사도] 주문이 완료되었습니다 (${order.totalAmount.toLocaleString("ko-KR")}원)`,
      html: buildOrderEmailHtml({
        orderName,
        orderNumber: orderNumber,
        totalAmount: order.totalAmount,
        recipientName: order.recipientName,
        address: `(${order.zipCode}) ${order.address1} ${order.address2 ?? ""}`.trim(),
      }),
    });
  }

  return NextResponse.json({
    orderId: order.id,
    orderNumber: orderNumber,
    orderName,
    totalAmount: order.totalAmount,
    alreadyPaid: false,
  });
}

/** "상품명 외 N건" 형식 (토스 orderName 규격과 동일 규칙) */
function buildOrderName(productNames: string[]): string {
  if (productNames.length === 0) return "주문 상품";
  if (productNames.length === 1) return productNames[0];
  return `${productNames[0]} 외 ${productNames.length - 1}건`;
}

function buildOrderEmailHtml(params: {
  orderName: string;
  orderNumber: string;
  totalAmount: number;
  recipientName: string;
  address: string;
}): string {
  return `
    <div style="max-width:600px;margin:0 auto;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#111;">
      <h2 style="font-size:20px;">주문이 완료되었습니다</h2>
      <p style="color:#555;">마이사도를 이용해 주셔서 감사합니다. 아래 주문 내역을 확인해주세요.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px;">
        <tr><td style="padding:8px 0;color:#888;width:110px;">주문명</td><td>${params.orderName}</td></tr>
        <tr><td style="padding:8px 0;color:#888;">주문번호</td><td>${params.orderNumber}</td></tr>
        <tr><td style="padding:8px 0;color:#888;">결제 금액</td><td><strong>${params.totalAmount.toLocaleString("ko-KR")}원</strong></td></tr>
        <tr><td style="padding:8px 0;color:#888;">받는 분</td><td>${params.recipientName}</td></tr>
        <tr><td style="padding:8px 0;color:#888;">배송지</td><td>${params.address}</td></tr>
      </table>
      <p style="margin-top:24px;font-size:13px;color:#888;">
        문의: mysado.shop@gmail.com · <a href="https://mysado.net" style="color:#555;">mysado.net</a>
      </p>
    </div>
  `;
}
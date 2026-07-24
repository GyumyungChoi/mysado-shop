import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTossPayment, PAYMENT_LOG_TYPE } from "@/lib/payment";

/**
 * POST /api/payment/webhook — 토스 웹훅 수신 (T-5)
 *
 * 역할:
 *  - confirm 성공 후 DB 반영 실패 등 극단 케이스의 보정망
 *  - (향후) 가상계좌 입금 통지 수신
 *
 * ⚠ 인증 없는 공개 엔드포인트 — 페이로드를 절대 신뢰하지 않는다.
 *  paymentKey만 추출한 뒤 토스 조회 API(getTossPayment)로 역검증하고,
 *  그 조회 결과만을 근거로 DB를 동기화한다.
 *
 * 응답 규칙 (토스는 200 외 응답 시 재발송):
 *  - 정상 처리 / 우리와 무관한 페이로드 = 200 (재발송 중단)
 *  - DB 등 일시 장애 = 500 (재발송이 곧 보정 수단)
 */
export async function POST(request: Request) {
  // ── 1. 페이로드 파싱 (원문 보존) ──
  const payload = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!payload) {
    // JSON도 아닌 요청 — 재발송 무의미
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // 토스 웹훅 형식 방어적 파싱:
  //  - { eventType, createdAt, data: { paymentKey, ... } } 형식
  //  - 평면 { paymentKey, ... } 형식
  const data =
    typeof payload.data === "object" && payload.data !== null
      ? (payload.data as Record<string, unknown>)
      : payload;

  const paymentKey =
    typeof data.paymentKey === "string" ? data.paymentKey : null;

  if (!paymentKey) {
    // paymentKey 없는 이벤트(취급 대상 아님) — 정상 응답으로 종료
    console.warn("[webhook] paymentKey 없는 페이로드 수신:", JSON.stringify(payload).slice(0, 500));
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ── 2. 역검증: 토스 조회 API — 이 결과만 신뢰 ──
  const verified = await getTossPayment(paymentKey);

  if (!verified.ok) {
    if (verified.code === "NETWORK_ERROR" || verified.code === "CONFIG_ERROR") {
      // 일시 장애 — 500으로 토스 재발송 유도
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    // 토스가 모르는 paymentKey(위조 등) — 무시하고 종료
    console.warn(`[webhook] 토스 조회 실패(code=${verified.code}) paymentKey=${paymentKey}`);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const payment = verified.payment;

  try {
    // ── 3. 검증된 orderId로 우리 주문 검색 ──
    // 토스 orderId 전환(28차) — 신규 주문은 MYSADO-..., 전환 이전 주문은 cuid
    // 전환 폴백: Phase 8 라이브 후 cuid 분기 제거 예정
    const order = await prisma.order.findUnique({
      where: payment.orderId.startsWith("MYSADO-")
        ? { orderNumber: payment.orderId }
        : { id: payment.orderId },
    });

    if (!order) {
      // PaymentLog.orderId는 필수 FK — 주문 없는 웹훅은 기록 불가, 콘솔만
      console.warn(`[webhook] 미존재 주문 orderId=${payment.orderId} paymentKey=${paymentKey}`);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // ── 4. WEBHOOK 로그 기록 (웹훅 원문 + 역검증 결과) ──
    await prisma.paymentLog.create({
      data: {
        orderId: order.id,
        type: PAYMENT_LOG_TYPE.WEBHOOK,
        paymentKey,
        payload: { webhook: payload, verified: payment } as object,
      },
    });

    // ── 5. 상태 동기화 (검증 결과 기준) ──
    if (payment.status === "DONE" && (order.status === "PENDING" || order.status === "FAILED")) {
      // confirm은 성공했으나 DB 반영이 누락된 케이스 보정
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          paymentKey,
          paidAt: payment.approvedAt ? new Date(payment.approvedAt) : new Date(),
        },
      });
      console.log(`[webhook] 주문 ${order.id}: ${order.status} → PAID 보정`);
    } else if (
      (payment.status === "CANCELED" || payment.status === "PARTIAL_CANCELED") &&
      order.status !== "CANCELED"
    ) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "CANCELED" },
      });
      console.log(`[webhook] 주문 ${order.id}: ${order.status} → CANCELED 동기화`);
    }
    // 그 외(상태 이미 일치 등)는 로그 기록만으로 충분

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    // DB 장애 등 — 500으로 재발송 유도
    console.error("[webhook] 처리 중 오류:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
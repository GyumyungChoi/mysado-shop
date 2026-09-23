import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTossPayment, PAYMENT_LOG_TYPE } from "@/lib/payment";
import { restoreStock, toStockLines, tryDeductStock } from "@/lib/inventory";

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
      include: { items: { select: { productId: true, quantity: true } } },
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
      // 반환: null = 전이 0건(다른 요청이 먼저 PAID로 만듦) / 배열 = 차감하지 못한 행
      const shortage = await prisma.$transaction(async (tx) => {
        // #104: 위 조건은 트랜잭션 밖의 읽기다 — 전이를 가장 먼저, 조건부로 한다.
        // confirm 라우트와 겹쳐 도착하면 한 쪽만 count = 1이 되고, 0건이면 차감하지 않는다
        const moved = await tx.order.updateMany({
          where: { id: order.id, status: { in: ["PENDING", "FAILED"] } },
          data: {
            status: "PAID",
            paymentKey,
            paidAt: payment.approvedAt ? new Date(payment.approvedAt) : new Date(),
          },
        });
        if (moved.count !== 1) return null;

        // 이 경로의 대상은 confirm 트랜잭션이 롤백된 미차감 주문 → 차감이 필요
        // confirm과 달리 부족해도 throw하지 않는다: 결제는 이미 토스에서 DONE이라
        // 재발송을 유도해도 결과가 같고 주문만 영구히 PENDING으로 남는다.
        // 가능한 만큼 차감하고 나머지를 기록하는 것이 이 경로의 정답.
        return tryDeductStock(tx, toStockLines(order.items));
      });

      if (shortage === null) {
        console.warn(`[payment-race] webhook 주문 ${order.id}: 다른 요청이 먼저 PAID로 전이 — 차감 생략`);
      } else {
        console.log(`[webhook] 주문 ${order.id}: ${order.status} → PAID 보정`);
        if (shortage.length > 0) {
          console.error(
            `[webhook] 🔴 수동 개입 필요 — 주문 ${order.id}: 재고 부족으로 일부 미차감`,
            shortage,
          );
        }
      }
    } else if (
      (payment.status === "CANCELED" || payment.status === "PARTIAL_CANCELED") &&
      order.status !== "CANCELED"
    ) {
      // 상태 동기화는 모든 미취소 주문에 대해 하되, 복원은 차감된 주문(PAID)에만
      // #104: PAID 여부를 트랜잭션 밖의 읽기로 정하지 않는다 — 조건부 전이의 건수로 정한다
      const outcome = await prisma.$transaction(async (tx) => {
        // ① PAID → CANCELED: 차감된 주문 → 복원
        const fromPaid = await tx.order.updateMany({
          where: { id: order.id, status: "PAID" },
          data: { status: "CANCELED" },
        });
        if (fromPaid.count === 1) {
          // PARTIAL_CANCELED도 전량 복원 — 우리 취소 API는 전액 취소만 지원하므로
          // 부분취소는 토스 콘솔 수동 조작 외에는 발생하지 않는다 (정밀 처리는 향후 과제)
          await restoreStock(tx, toStockLines(order.items));
          return "restored";
        }
        // ② PENDING/FAILED → CANCELED: 미차감 주문 → 상태만
        const fromUnpaid = await tx.order.updateMany({
          where: { id: order.id, status: { in: ["PENDING", "FAILED"] } },
          data: { status: "CANCELED" },
        });
        return fromUnpaid.count === 1 ? "synced" : "none";
      });

      if (outcome === "none") {
        // 두 전이 모두 0건 — 다른 요청이 먼저 CANCELED로 만들었거나, ①과 ② 사이에 동시 요청이
        // PENDING → PAID로 바꿨다. 후자면 PAID로 남아 토스와 어긋나므로 500으로 재발송을 유도해 수렴시킨다
        const current = await prisma.order.findUnique({
          where: { id: order.id },
          select: { status: true },
        });
        if (current?.status !== "CANCELED") {
          console.warn(`[payment-race] webhook 주문 ${order.id}: CANCELED 동기화 0건(현재 ${current?.status}) — 재발송 유도`);
          return NextResponse.json({ ok: false }, { status: 500 });
        }
        console.warn(`[payment-race] webhook 주문 ${order.id}: 다른 요청이 먼저 CANCELED로 전이 — 복원 생략`);
      } else {
        console.log(`[webhook] 주문 ${order.id}: ${order.status} → CANCELED 동기화 (재고복원 ${outcome === "restored"})`);
      }
    }
    // 그 외(상태 이미 일치 등)는 로그 기록만으로 충분

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    // DB 장애 등 — 500으로 재발송 유도
    console.error("[webhook] 처리 중 오류:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
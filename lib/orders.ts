import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-helpers";
import type { ShippingInfo } from "@/types/order";

/** 주문 생성 API가 돌려줄 최소 정보 */
export interface CreateOrderResult {
  orderId: string;      // Order.id (cuid) — Step 4에서 토스 orderId로 그대로 사용
  totalAmount: number;  // 서버가 재계산한 결제 금액
  orderName: string;    // 토스 결제창 표시용 (예: "상품명 외 2건")
}

/** 배송지 입력 검증 + 정규화 (통과 시 저장용 값 반환, 실패 시 ApiError 400) */
export function validateShippingInfo(raw: Partial<ShippingInfo>): ShippingInfo {
  const recipientName = raw.recipientName?.trim();
  if (!recipientName) throw new ApiError("수령인 이름을 입력해주세요.", 400);

  // 하이픈/공백 제거 후 010 + 8자리 (회원가입과 동일 규칙)
  const recipientPhone = raw.recipientPhone?.replace(/[-\s]/g, "") ?? "";
  if (!/^010\d{8}$/.test(recipientPhone)) {
    throw new ApiError("연락처는 010으로 시작하는 11자리 번호여야 합니다.", 400);
  }

  const zipCode = raw.zipCode?.trim();
  if (!zipCode || !/^\d{5}$/.test(zipCode)) {
    throw new ApiError("우편번호 5자리를 입력해주세요.", 400);
  }

  const address1 = raw.address1?.trim();
  if (!address1) throw new ApiError("주소를 입력해주세요.", 400);

  return {
    recipientName,
    recipientPhone,
    zipCode,
    address1,
    address2: raw.address2?.trim() || undefined,
    deliveryMemo: raw.deliveryMemo?.trim() || undefined,
  };
}

/**
 * 주문 생성 — 장바구니의 구매 가능 항목으로 Order(PENDING) + OrderItem 스냅샷 생성.
 * - 금액은 트랜잭션 안에서 DB 가격으로 재계산 (discountedPrice ?? price)
 * - 장바구니는 삭제하지 않음 (결제 완료 시점에 삭제 — Step 4)
 */
export async function createOrder(
  userId: string,
  shipping: ShippingInfo
): Promise<CreateOrderResult> {
  return prisma.$transaction(async (tx) => {
    // 1) 장바구니 + 상품 현재 상태 조회
    const cartItems = await tx.cartItem.findMany({
      where: { userId },
      include: { product: true },
      orderBy: { createdAt: "desc" },
    });

    if (cartItems.length === 0) {
      throw new ApiError("장바구니가 비어 있습니다.", 400);
    }

    // 2) 구매 가능 항목만 필터 (getCart의 isPurchasable과 동일 기준)
    const purchasable = cartItems.filter(
      (item) =>
        item.product.isVisible &&
        item.product.status === "SALE" &&
        item.product.stock >= item.quantity
    );

    if (purchasable.length === 0) {
      throw new ApiError("주문 가능한 상품이 없습니다. 장바구니를 확인해주세요.", 400);
    }

    // 3) 금액 서버 재계산 + 스냅샷 데이터 구성
    const itemsData = purchasable.map((item) => {
      const unitPrice = item.product.discountedPrice ?? item.product.price;
      return {
        productId: item.productId,
        productName: item.product.name,
        unitPrice,
        quantity: item.quantity,
      };
    });

    const totalAmount = itemsData.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );

    // 4) 사람이 읽는 주문번호 발급 — MYSADO-YYMMDD-NNNN (KST 날짜 기준)
    //    동시 주문 시 동일 번호 계산 가능성 있으나 order_number UNIQUE 제약이 최후 방어
    //    (라이브 전 트래픽에선 사실상 미발생 — 필요 시 재시도 로직 추가 예정)
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const datePart = kstNow.toISOString().slice(2, 10).replace(/-/g, ""); // "260718"
    const prefix = `MYSADO-${datePart}-`;
    const lastToday = await tx.order.findFirst({
      where: { orderNumber: { startsWith: prefix } },
      orderBy: { orderNumber: "desc" },
      select: { orderNumber: true },
    });
    const nextSeq = lastToday?.orderNumber
      ? parseInt(lastToday.orderNumber.slice(prefix.length), 10) + 1
      : 1;
    const orderNumber = `${prefix}${String(nextSeq).padStart(4, "0")}`;

    // 5) Order + OrderItem을 한 번에 생성 (nested create — 원자성 보장)
    const order = await tx.order.create({
      data: {
        userId,
        orderNumber,
        totalAmount,
        recipientName: shipping.recipientName,
        recipientPhone: shipping.recipientPhone,
        zipCode: shipping.zipCode,
        address1: shipping.address1,
        address2: shipping.address2 ?? null,
        deliveryMemo: shipping.deliveryMemo ?? null,
        items: { create: itemsData },
      },
      select: { id: true, totalAmount: true },
    });

    // 6) 토스 결제창 표시용 주문명
    const orderName =
      itemsData.length === 1
        ? itemsData[0].productName
        : `${itemsData[0].productName} 외 ${itemsData.length - 1}건`;

    return { orderId: order.id, totalAmount: order.totalAmount, orderName };
  });
}

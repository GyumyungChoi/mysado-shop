import { NextResponse } from "next/server";
import { getUserId, toErrorResponse } from "@/lib/api-helpers";
import { createOrder, validateShippingInfo } from "@/lib/orders";
import type { ShippingInfo } from "@/types/order";

/** POST /api/orders — 장바구니의 구매 가능 항목으로 주문 생성 (PENDING) */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { shipping?: Partial<ShippingInfo> };

    if (!body.shipping || typeof body.shipping !== "object") {
      return NextResponse.json({ message: "배송지 정보가 없습니다." }, { status: 400 });
    }

    const shipping = validateShippingInfo(body.shipping);
    const result = await createOrder(userId, shipping);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

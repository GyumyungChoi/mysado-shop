import { NextResponse } from "next/server";
import { getUserId, toErrorResponse } from "@/lib/api-helpers";
import { updateCartItemQuantity, removeCartItem } from "@/lib/cart";

/** 수량 변경 요청 바디 타입 */
interface UpdateQuantityBody {
  quantity: number;
}

/** 동적 세그먼트 [id] 파라미터 타입 (Next 14 Route Handler 규격) */
interface RouteContext {
  params: { id: string };
}

/** URL의 [id]를 CartItem.id(양의 정수)로 파싱, 실패 시 null */
function parseCartItemId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
}

/** PATCH /api/cart/[id] — 수량 변경 (1 이상, 재고 이내) */
export async function PATCH(request: Request, { params }: RouteContext) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const cartItemId = parseCartItemId(params.id);
  if (cartItemId === null) {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
  }

  try {
    const body = (await request.json()) as Partial<UpdateQuantityBody>;

    if (typeof body.quantity !== "number") {
      return NextResponse.json({ message: "수량이 없습니다." }, { status: 400 });
    }

    await updateCartItemQuantity(userId, cartItemId, body.quantity);

    return NextResponse.json({ message: "수량을 변경했습니다." }, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/cart/[id] — 항목 삭제 (본인 소유만) */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const cartItemId = parseCartItemId(params.id);
  if (cartItemId === null) {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
  }

  try {
    await removeCartItem(userId, cartItemId);

    return NextResponse.json({ message: "삭제했습니다." }, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

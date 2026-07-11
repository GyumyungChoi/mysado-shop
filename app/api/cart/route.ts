import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getCart, addToCart, CartError } from "@/lib/cart";

/** 담기 요청 바디 타입 */
interface AddToCartBody {
  productId: string;
  quantity: number;
}

/** 세션을 서버에서 검증하고 userId를 반환, 비로그인이면 null */
async function getUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: headers() });
  return session?.user.id ?? null;
}

/** CartError는 해당 상태코드로, 그 외는 500으로 응답 */
function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof CartError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  console.error("장바구니 API 오류:", error);
  return NextResponse.json(
    { message: "잠시 후 다시 시도해주세요" },
    { status: 500 }
  );
}

/** GET /api/cart — 내 장바구니 조회 (가격/합계는 항상 현재 DB 값) */
export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const cart = await getCart(userId);
    return NextResponse.json(cart, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/cart — 장바구니 담기 (이미 있으면 수량 증가) */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Partial<AddToCartBody>;

    if (!body.productId || typeof body.productId !== "string") {
      return NextResponse.json({ message: "상품 정보가 없습니다." }, { status: 400 });
    }

    await addToCart(userId, body.productId, body.quantity ?? 1);

    return NextResponse.json({ message: "장바구니에 담았습니다." }, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

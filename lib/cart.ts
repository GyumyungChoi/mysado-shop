
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-helpers";

/** 장바구니 조작 실패 시 던지는 에러 (Route Handler가 status를 그대로 응답코드로 사용) */
export class CartError extends ApiError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = "CartError";
  }
}

/** 장바구니 화면에 내려줄 항목 1건 (가격은 항상 현재 DB 값) */
export interface CartItemView {
  id: number;            // CartItem.id — 수량변경/삭제 시 사용
  productId: string;
  name: string;
  image: string | null;  // 대표 이미지 (images[0])
  unitPrice: number;     // 현재 판매가 (discountedPrice ?? price)
  quantity: number;
  lineTotal: number;     // unitPrice * quantity
  stock: number;
  isAvailable: boolean;  // 노출중 + SALE + 재고>=수량 이어야 true
}

/** 장바구니 전체 응답 (합계는 서버에서 계산) */
export interface CartView {
  items: CartItemView[];
  totalAmount: number;   // 구매 가능(isAvailable) 항목만 합산
  totalCount: number;    // 전체 항목 수 (헤더 뱃지용)
}

/** 상품이 현재 구매 가능한 상태인지 (노출 + 판매중 + 재고 충분) */
function isPurchasable(
  product: { isVisible: boolean; status: string; stock: number },
  quantity: number
): boolean {
  return product.isVisible && product.status === "SALE" && product.stock >= quantity;
}

/** 내 장바구니 조회 — 가격/합계는 조회 시점 DB 값으로 서버에서 계산 */
export async function getCart(userId: string): Promise<CartView> {
  const rows = await prisma.cartItem.findMany({
    where: { userId },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  const items: CartItemView[] = rows.map((row) => {
    const unitPrice = row.product.discountedPrice ?? row.product.price;
    return {
      id: row.id,
      productId: row.productId,
      name: row.product.name,
      image: row.product.images[0] ?? null,
      unitPrice,
      quantity: row.quantity,
      lineTotal: unitPrice * row.quantity,
      stock: row.product.stock,
      isAvailable: isPurchasable(row.product, row.quantity),
    };
  });

  const totalAmount = items
    .filter((item) => item.isAvailable)
    .reduce((sum, item) => sum + item.lineTotal, 0);

  return { items, totalAmount, totalCount: items.length };
}

/** 장바구니 담기 — 이미 있으면 수량 증가 (@@unique(userId, productId) 활용 upsert)
 *  트랜잭션으로 재고 검증 → upsert 를 묶어 초과 담기를 방지합니다 */
export async function addToCart(
  userId: string,
  productId: string,
  quantity: number
): Promise<void> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new CartError("수량은 1 이상의 정수여야 합니다.", 400);
  }

  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId } });

    if (!product || !product.isVisible) {
      throw new CartError("존재하지 않는 상품입니다.", 404);
    }
    if (product.status !== "SALE") {
      throw new CartError("현재 판매 중인 상품이 아닙니다.", 400);
    }

    // 기존 담긴 수량 + 이번 추가 수량이 재고를 넘지 않는지 확인
    const existing = await tx.cartItem.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    const newQuantity = (existing?.quantity ?? 0) + quantity;

    if (newQuantity > product.stock) {
      throw new CartError(
        `재고가 부족합니다. (재고 ${product.stock}개, 장바구니 ${existing?.quantity ?? 0}개)`,
        400
      );
    }

    await tx.cartItem.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId, quantity },
      update: { quantity: newQuantity },
    });
  });
}

/** 수량 변경 — 본인 소유 항목만, 1 이상, 재고 이내 */
export async function updateCartItemQuantity(
  userId: string,
  cartItemId: number,
  quantity: number
): Promise<void> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new CartError("수량은 1 이상의 정수여야 합니다.", 400);
  }

  // userId 조건을 함께 걸어 남의 항목 조작을 차단 (404로 존재 여부도 숨김)
  const item = await prisma.cartItem.findFirst({
    where: { id: cartItemId, userId },
    include: { product: true },
  });

  if (!item) {
    throw new CartError("장바구니에 없는 항목입니다.", 404);
  }
  if (quantity > item.product.stock) {
    throw new CartError(`재고가 부족합니다. (재고 ${item.product.stock}개)`, 400);
  }

  await prisma.cartItem.update({
    where: { id: cartItemId },
    data: { quantity },
  });
}

/** 항목 삭제 — deleteMany에 userId 조건 포함 (본인 것만 삭제됨) */
export async function removeCartItem(
  userId: string,
  cartItemId: number
): Promise<void> {
  const result = await prisma.cartItem.deleteMany({
    where: { id: cartItemId, userId },
  });

  if (result.count === 0) {
    throw new CartError("장바구니에 없는 항목입니다.", 404);
  }
}

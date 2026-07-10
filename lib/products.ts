import { prisma } from "@/lib/prisma";
import type { Product } from "@/types/product";
import type { Product as ProductRow } from "@prisma/client";

/** Prisma 결과(camelCase) → 기존 Product 타입(snake_case) 매핑
 *  페이지/컴포넌트 코드를 바꾸지 않기 위한 어댑터입니다 */
function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    origin_product_no: row.originProductNo,
    channel_product_no: row.channelProductNo,
    sku: row.sku,
    category_id: row.categoryId,
    category_name: row.categoryName,
    name: row.name,
    price: row.price,
    discounted_price: row.discountedPrice,
    stock_quantity: row.stock,
    status: row.status,
    description: row.description,
    detail_html: row.detailHtml,
    images: row.images,
    brand: row.brand,
    manufacturer_name: row.manufacturerName,
    model_name: row.modelName,
    tags: row.tags,
    is_active: row.isVisible,
    delivery_fee: row.deliveryFee,
    return_fee: row.returnFee,
    exchange_fee: row.exchangeFee,
    smartstore_url: row.smartstoreUrl,
    sort_order: row.sortOrder,
    created_at: row.registeredAt.toISOString(),
  };
}

/** 노출 상품 중 베스트 상품을 정렬 순서대로 반환 (홈) */
export async function getBestProducts(limit = 6): Promise<Product[]> {
  const rows = await prisma.product.findMany({
    where: { isVisible: true },
    orderBy: { sortOrder: "asc" },
    take: limit,
  });
  return rows.map(toProduct);
}

/** 카테고리별 노출 상품을 정렬 순서대로 반환 (목록) */
export async function getFilteredProducts(categoryId?: string): Promise<Product[]> {
  const rows = await prisma.product.findMany({
    where: {
      isVisible: true,
      ...(categoryId ? { categoryId } : {}),
    },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(toProduct);
}

/** id로 노출 상품 1개 조회, 없거나 숨김이면 null (상세) */
export async function getProductById(id: string): Promise<Product | null> {
  const row = await prisma.product.findUnique({ where: { id } });
  if (!row || !row.isVisible) return null;
  return toProduct(row);
}

/** 같은 카테고리의 관련 상품 (상세 하단) */
export async function getRelatedProducts(
  categoryId: string,
  excludeId: string,
  limit = 4
): Promise<Product[]> {
  const rows = await prisma.product.findMany({
    where: {
      isVisible: true,
      categoryId,
      id: { not: excludeId },
    },
    orderBy: { sortOrder: "asc" },
    take: limit,
  });
  return rows.map(toProduct);
}
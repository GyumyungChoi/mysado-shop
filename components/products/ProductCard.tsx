import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/types/product";
import { getStatusBadgeLabel } from "@/lib/product-status";

/** 할인율(%)을 계산합니다 */
function getDiscountRate(price: number, discountedPrice: number): number {
  return Math.round(((price - discountedPrice) / price) * 100);
}

/** 상품 카드 (이미지, 이름, 가격) */
export default function ProductCard({ product }: { product: Product }) {
  const hasDiscount = product.discounted_price !== null;
  const statusBadge = getStatusBadgeLabel(product.status, product.stock_quantity);
  const displayPrice = product.discounted_price ?? product.price;

  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-100 transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-gray-50">
        <Image
          src={product.images[0]}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
          className={`object-cover transition-transform group-hover:scale-105 ${
            statusBadge ? "opacity-40" : ""
          }`}
        />
        {hasDiscount && (
          <span className="absolute left-2 top-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
            {getDiscountRate(product.price, product.discounted_price as number)}%
          </span>
        )}
        {statusBadge && (
          <span className="absolute right-2 top-2 rounded-full bg-gray-800 px-2 py-0.5 text-xs font-semibold text-white">
            {statusBadge}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm text-gray-700">{product.name}</p>
        <div className="flex items-baseline gap-2">
          {hasDiscount && (
            <span className="text-xs text-gray-400 line-through">
              {product.price.toLocaleString("ko-KR")}원
            </span>
          )}
          <span className="font-semibold text-gray-900">
            {displayPrice.toLocaleString("ko-KR")}원
          </span>
        </div>
      </div>
    </Link>
  );
}

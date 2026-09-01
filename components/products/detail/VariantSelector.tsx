import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/types/product";
import { isPrimary } from "@/lib/product-group";

/** 같은 묶음(ProductGroup)의 색상·디자인 변형 선택 (Phase 7 71차)
 *  items 는 현재 상품을 포함한 묶음 전량이며, currentId 로 현재 위치를 표시합니다.
 *  관련 상품(다른 상품)과 병존합니다 — 대체 관계가 아닙니다 */
export default function VariantSelector({
  items,
  currentId,
}: {
  items: Product[];
  currentId: string;
}) {
  if (items.length <= 1) return null;

  return (
    <div className="mt-6">
      <p className="mb-2 text-sm font-medium text-gray-700">
        다른 색상·디자인
      </p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {items.map((item) => {
          const isCurrent = item.id === currentId;
          const label = item.variant_label || item.name;
          const thumb = (
            <>
              <div
                className={`relative h-16 w-16 overflow-hidden rounded-lg bg-gray-50 ${
                  isCurrent ? "ring-2 ring-gray-900" : "ring-1 ring-gray-200"
                }`}
              >
                <Image
                  src={item.images[0]}
                  alt={label}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
                {isPrimary(item.group_role) && (
                  <span className="absolute left-0 top-0 rounded-br-md bg-gray-800 px-1 py-0.5 text-[10px] font-semibold text-white">
                    대표
                  </span>
                )}
              </div>
              <span
                className={`mt-1 block w-16 truncate text-center text-xs ${
                  isCurrent ? "font-semibold text-gray-900" : "text-gray-500"
                }`}
              >
                {label}
              </span>
            </>
          );

          if (isCurrent) {
            return (
              <div key={item.id} aria-current="true">
                {thumb}
              </div>
            );
          }

          return (
            <Link key={item.id} href={`/products/${item.id}`}>
              {thumb}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

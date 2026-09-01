import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/types/product";
import { isPrimary } from "@/lib/product-group";

/** 묶음 내 라벨의 최장공통접두·접미 길이를 구합니다.
 *  variant_label 이 상품명 전체로 채워져 있어(71차 실측) 공통부를 깎아야 변별이 드러납니다.
 *  DB 값은 고치지 않고 표시 층에서만 처리합니다 */
function commonAffix(labels: string[]): { pre: number; suf: number } {
  if (labels.length < 2) return { pre: 0, suf: 0 };
  const min = Math.min(...labels.map((s) => s.length));
  let pre = 0;
  while (pre < min && labels.every((s) => s[pre] === labels[0][pre])) pre++;
  let suf = 0;
  while (
    suf < min - pre &&
    labels.every((s) => s[s.length - 1 - suf] === labels[0][labels[0].length - 1 - suf])
  ) {
    suf++;
  }
  return { pre, suf };
}

/** 공통부를 깎고 가장자리 구두점·공백을 다듬습니다. 너무 짧아지면 원본 유지 */
function trimAffix(label: string, pre: number, suf: number): string {
  const cut = label.slice(pre, label.length - suf).replace(/^[\s,·/-]+|[\s,·/-]+$/g, "");
  return cut.length >= 2 ? cut : label;
}

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

  const { pre, suf } = commonAffix(
    items.map((i) => i.variant_label || i.name)
  );

  return (
    <div className="mt-6">
      <p className="mb-2 text-sm font-medium text-gray-700">
        다른 색상·디자인
      </p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {items.map((item) => {
          const isCurrent = item.id === currentId;
          const label = trimAffix(item.variant_label || item.name, pre, suf);
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
                className={`mt-1 block w-20 text-center text-xs leading-tight line-clamp-2 ${
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

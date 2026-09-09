/**
 * GET /api/v1/products 지원 모듈 — 파트너(허브)용 상품 목록 조회.
 *
 * 명명 규칙 (77차 확정)
 *   요청 쿼리 파라미터 = camelCase   (orders 관례를 따른다)
 *   응답 키            = snake_case  (2026-09-02 상품 CSV 계약 어휘를 따른다)
 *   요청 본문 규칙은 정하지 않았다 — 이 API에는 본문이 없다.
 *
 * 이름이 세 겹으로 갈리는 컬럼이 있다. 반드시 아래 표를 보고 쓴다.
 *   DB 컬럼            Prisma 필드        응답 키
 *   stock_quantity     stock              stock_qty_nominal
 *   is_active          isVisible          is_active
 *   (없음 · 계산)      (없음)             sku_match_key
 */

import { isoWithOffset } from "@/lib/api-v1/response";

/** 허용 쿼리 파라미터. 여기 없는 키가 오면 400이며, 오류 메시지에 이 배열을 그대로 실는다. */
export const ALLOWED_PARAMS = ["updatedAfter", "inventorySource", "limit", "offset"];

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * inventory_source 어휘.
 *
 * 이 컬럼을 읽는 애플리케이션 코드는 77차 실측 시점까지 0건이었고, 전용 모듈도 없다.
 * 이 파일이 첫 소비자다. 두 번째 소비자(S-3 재고 SET)가 생기면 그때
 * lib/inventory-source.ts 로 옮긴다 — 지금 쓰지 않을 모듈을 미리 만들지 않는다.
 */
const VALID_INVENTORY_SOURCE = ["HUB", "MANUAL"];

/**
 * 오프셋이 붙은 ISO8601만 받는다. naive 시각(`2026-09-08T21:00:00`)은 400이다.
 * orders 의 updatedAfter 와 같은 방침이며, 파트너 수집기가 이미 이 형태를 쓴다.
 */
const ISO_WITH_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Prisma 에 그대로 넘기는 where. 구조적 타입이라 별도 import 가 필요 없다. */
export type ProductWhere = {
  updatedAt?: { gt: Date };
  inventorySource?: string;
};

export type ParsedProductParams =
  | { ok: true; value: { where: ProductWhere; limit: number; offset: number } }
  | { ok: false; message: string };

/** 조회 대상 컬럼 19개 = 응답 18열 중 DB 컬럼 17개 + 메타 2개. sku_match_key 는 계산값이다. */
export const PRODUCT_SELECT = {
  id: true,
  sku: true,
  originProductNo: true,
  channelProductNo: true,
  name: true,
  categoryName: true,
  brand: true,
  modelName: true,
  price: true,
  discountedPrice: true,
  stock: true,
  status: true,
  isVisible: true,
  inventorySource: true,
  groupId: true,
  groupRole: true,
  variantLabel: true,
  stockUpdatedAt: true,
  updatedAt: true,
} as const;

/** PRODUCT_SELECT 로 뽑은 행의 형태. 스키마와 어긋나면 tsc 가 잡는다. */
export type ProductRow = {
  id: string;
  sku: string | null;
  originProductNo: string;
  channelProductNo: string;
  name: string;
  categoryName: string;
  brand: string;
  modelName: string;
  price: number;
  discountedPrice: number | null;
  stock: number;
  status: string;
  isVisible: boolean;
  inventorySource: string;
  groupId: string | null;
  groupRole: string | null;
  variantLabel: string | null;
  stockUpdatedAt: Date | null;
  updatedAt: Date;
};

/**
 * 허브 품목코드와 대조할 때 쓰는 정준값. 말미의 `KR` 만 뗀다(48차).
 * 저장 컬럼이 아니라 계산 필드이며, 원본은 언제나 sku 다.
 */
export function skuMatchKey(sku: string | null): string | null {
  if (sku === null) return null;
  return sku.replace(/KR$/, "");
}

export function parseProductListParams(url: URL): ParsedProductParams {
  const sp = url.searchParams;

  const unknown: string[] = [];
  sp.forEach((_value, key) => {
    if (ALLOWED_PARAMS.indexOf(key) === -1) unknown.push(key);
  });
  if (unknown.length > 0) {
    return {
      ok: false,
      message: `알 수 없는 파라미터입니다: ${unknown.join(",")}. 허용: ${ALLOWED_PARAMS.join(", ")}`,
    };
  }

  const where: ProductWhere = {};

  const rawUpdatedAfter = sp.get("updatedAfter");
  if (rawUpdatedAfter !== null) {
    if (!ISO_WITH_TZ.test(rawUpdatedAfter)) {
      return {
        ok: false,
        message: "updatedAfter 는 오프셋이 포함된 ISO8601이어야 합니다 (예: 2026-09-08T21:00:00+09:00).",
      };
    }
    const d = new Date(rawUpdatedAfter);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, message: "updatedAfter 를 시각으로 해석할 수 없습니다." };
    }
    where.updatedAt = { gt: d };
  }

  const rawSource = sp.get("inventorySource");
  if (rawSource !== null) {
    if (VALID_INVENTORY_SOURCE.indexOf(rawSource) === -1) {
      return {
        ok: false,
        message: `inventorySource 는 ${VALID_INVENTORY_SOURCE.join(" 또는 ")} 여야 합니다.`,
      };
    }
    where.inventorySource = rawSource;
  }

  let limit = DEFAULT_LIMIT;
  const rawLimit = sp.get("limit");
  if (rawLimit !== null) {
    if (!/^\d+$/.test(rawLimit)) {
      return { ok: false, message: "limit은 정수여야 합니다." };
    }
    limit = Number(rawLimit);
    if (limit < 1 || limit > MAX_LIMIT) {
      return { ok: false, message: `limit은 1 이상 ${MAX_LIMIT} 이하여야 합니다.` };
    }
  }

  let offset = 0;
  const rawOffset = sp.get("offset");
  if (rawOffset !== null) {
    if (!/^\d+$/.test(rawOffset)) {
      return { ok: false, message: "offset은 0 이상의 정수여야 합니다." };
    }
    offset = Number(rawOffset);
  }

  return { ok: true, value: { where, limit, offset } };
}

/**
 * 응답 1건 직렬화.
 *
 * null 정책 — 진짜 null 은 sku · sku_match_key · discounted_price · group_id ·
 * group_role · variant_label · stock_updated_at 의 7개뿐이다.
 * model_name 은 NOT NULL DEFAULT '' 이라 값이 없으면 **빈 문자열**이며 null 이 아니다.
 *
 * stock_updated_at 의 null 은 "재고가 없다"가 아니라
 * "판매 층에서 재고를 건드린 사건이 아직 없음" 이다(76차, 백필하지 않았다).
 */
export function serializeProduct(row: ProductRow) {
  return {
    product_id: row.id,
    sku: row.sku,
    sku_match_key: skuMatchKey(row.sku),
    origin_product_no: row.originProductNo,
    channel_product_no: row.channelProductNo,
    name: row.name,
    category_name: row.categoryName,
    brand: row.brand,
    model_name: row.modelName,
    price: row.price,
    discounted_price: row.discountedPrice,
    stock_qty_nominal: row.stock,
    status: row.status,
    is_active: row.isVisible,
    inventory_source: row.inventorySource,
    group_id: row.groupId,
    group_role: row.groupRole,
    variant_label: row.variantLabel,
    stock_updated_at: row.stockUpdatedAt === null ? null : isoWithOffset(row.stockUpdatedAt),
    updated_at: isoWithOffset(row.updatedAt),
  };
}

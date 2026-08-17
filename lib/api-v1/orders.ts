import { Prisma } from "@prisma/client";
import type { OrderStatus } from "@prisma/client";
import { STATUS_LABEL } from "@/lib/order-status";
import { isoWithOffset } from "@/lib/api-v1/response";

/**
 * GET /api/v1/orders 의 파라미터 파싱 · 커서 · 직렬화.
 *
 * 목록과 단건이 같은 SELECT·같은 직렬화를 쓰도록 여기 한 곳에만 둔다.
 * 라우트는 인증·rate limit·응답 조립만 한다.
 */

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;

/** 허용 파라미터. 목록 밖 키는 400 — 오타를 조용히 무시하지 않는다. */
const ALLOWED_PARAMS = [
  "from",
  "to",
  "updatedAfter",
  "status",
  "orderNumber",
  "cursor",
  "limit",
];

/** 유효 상태 어휘의 정본은 lib/order-status.ts. 상태가 늘면 이 배열이 자동으로 따라온다. */
const VALID_STATUS = Object.keys(STATUS_LABEL) as OrderStatus[];

/**
 * 오프셋(또는 Z)이 붙은 ISO 8601만 허용한다.
 * 오프셋 없는 문자열은 JS가 형식에 따라 UTC/로컬로 갈라 읽어 9시간 어긋난다.
 */
const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

/**
 * 응답에 나가는 필드만 고른다.
 * paymentKey(토스 키) · userId(내부 신원)는 여기에 없어야 한다.
 */
export const ORDER_SELECT = Prisma.validator<Prisma.OrderSelect>()({
  id: true,
  orderNumber: true,
  status: true,
  totalAmount: true,
  paidAt: true,
  ordererName: true,
  ordererEmail: true,
  ordererPhone: true,
  recipientName: true,
  recipientPhone: true,
  zipCode: true,
  address1: true,
  address2: true,
  deliveryMemo: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: {
      productId: true,
      productName: true,
      unitPrice: true,
      quantity: true,
      // sku는 주문 시점 스냅샷이다(55차: sku_snapshot 컬럼 신설, product 조인 제거).
      skuSnapshot: true,
    },
    orderBy: { id: "asc" },
  },
});

export type OrderRow = Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>;

export type ListQuery = { limit: number; where: Prisma.OrderWhereInput };

export type ParseResult =
  | { ok: true; value: ListQuery }
  | { ok: false; message: string };

/** 오프셋 표기를 요구하는 엄격 파서. 실패는 null. */
function parseIsoStrict(raw: string): Date | null {
  if (!ISO_WITH_OFFSET.test(raw)) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

const ISO_HINT = "오프셋을 포함한 ISO 8601이어야 합니다. 예: 2026-08-14T00:00:00+09:00";

/**
 * 커서는 `(updatedAt, id)` 복합이다. 동일 updatedAt 다건이 존재할 수 있으므로 시간값 단독은 금지.
 *
 * 표시용 updatedAt(`isoWithOffset`)은 초 단위로 내려가지만, 커서에는 `toISOString()`
 * 원본(밀리초 포함)을 넣는다. 표시 정밀도와 기계 정밀도를 겸하려다 정밀도를 잃지 않기 위함이다.
 *
 * 서명하지 않는다 — 위조로 얻는 것이 "다른 지점부터 읽기"뿐이고 이미 인증을 통과한 주체다.
 */
export function encodeCursor(updatedAt: Date, id: string): string {
  const json = JSON.stringify({ u: updatedAt.toISOString(), i: id });
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeCursor(raw: string): { updatedAt: Date; id: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.u !== "string" || typeof obj.i !== "string" || obj.i.length === 0) {
    return null;
  }
  const d = new Date(obj.u);
  if (Number.isNaN(d.getTime())) return null;

  return { updatedAt: d, id: obj.i };
}

/** 쿼리스트링을 Prisma where + limit 으로 바꾼다. 실패는 예외가 아니라 반환값(auth.ts 규약). */
export function parseListParams(url: URL): ParseResult {
  const sp = url.searchParams;

  const unknown: string[] = [];
  sp.forEach((_value, key) => {
    if (ALLOWED_PARAMS.indexOf(key) === -1) unknown.push(key);
  });
  if (unknown.length > 0) {
    return { ok: false, message: `알 수 없는 파라미터입니다: ${unknown.join(",")}` };
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

  const rawCursor = sp.get("cursor");
  const rawUpdatedAfter = sp.get("updatedAfter");
  if (rawCursor !== null && rawUpdatedAfter !== null) {
    return { ok: false, message: "cursor와 updatedAfter는 함께 쓸 수 없습니다." };
  }

  const and: Prisma.OrderWhereInput[] = [];

  const rawFrom = sp.get("from");
  if (rawFrom !== null) {
    const d = parseIsoStrict(rawFrom);
    if (d === null) return { ok: false, message: `from은 ${ISO_HINT}` };
    and.push({ createdAt: { gte: d } });
  }

  const rawTo = sp.get("to");
  if (rawTo !== null) {
    const d = parseIsoStrict(rawTo);
    if (d === null) return { ok: false, message: `to는 ${ISO_HINT}` };
    // 미만(lt) — 경계 주문이 두 페이지에 중복 등장하지 않게 한다.
    and.push({ createdAt: { lt: d } });
  }

  if (rawUpdatedAfter !== null) {
    const d = parseIsoStrict(rawUpdatedAfter);
    if (d === null) return { ok: false, message: `updatedAfter는 ${ISO_HINT}` };
    and.push({ updatedAt: { gt: d } });
  }

  const rawStatus = sp.get("status");
  if (rawStatus !== null) {
    const tokens = rawStatus
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (tokens.length === 0) {
      return { ok: false, message: "status가 비어 있습니다." };
    }
    const invalid = tokens.filter((t) => !VALID_STATUS.includes(t as OrderStatus));
    if (invalid.length > 0) {
      return { ok: false, message: `알 수 없는 status입니다: ${invalid.join(",")}` };
    }
    and.push({ status: { in: tokens as OrderStatus[] } });
  }

  const rawOrderNumber = sp.get("orderNumber");
  if (rawOrderNumber !== null) {
    const value = rawOrderNumber.trim();
    if (value.length === 0) {
      return { ok: false, message: "orderNumber가 비어 있습니다." };
    }
    and.push({ orderNumber: value });
  }

  if (rawCursor !== null) {
    const cursor = decodeCursor(rawCursor);
    if (cursor === null) {
      // 첫 페이지로 폴백하지 않는다 — 손상을 조용히 삼키면 아무도 관측하지 못한다.
      return { ok: false, message: "cursor가 올바르지 않습니다." };
    }
    // (updatedAt, id) > (u, i) 의 복합 비교. Prisma의 단일 컬럼 cursor 옵션으로는 표현할 수 없다.
    and.push({
      OR: [
        { updatedAt: { gt: cursor.updatedAt } },
        { updatedAt: cursor.updatedAt, id: { gt: cursor.id } },
      ],
    });
  }

  return { ok: true, value: { limit, where: and.length > 0 ? { AND: and } : {} } };
}

/** 주문 1건을 응답 형태로 바꾼다. 목록·단건이 같은 모양을 내도록 유일한 경로로 둔다. */
export function serializeOrder(row: OrderRow) {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    totalAmount: row.totalAmount,
    paidAt: row.paidAt !== null ? isoWithOffset(row.paidAt) : null,
    orderer: {
      name: row.ordererName,
      email: row.ordererEmail,
      phone: row.ordererPhone,
    },
    shipping: {
      recipientName: row.recipientName,
      recipientPhone: row.recipientPhone,
      zipCode: row.zipCode,
      address1: row.address1,
      address2: row.address2,
      deliveryMemo: row.deliveryMemo,
    },
    lineItems: row.items.map((item) => ({
      productId: item.productId,
      sku: item.skuSnapshot,
      productName: item.productName,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    })),
    createdAt: isoWithOffset(row.createdAt),
    updatedAt: isoWithOffset(row.updatedAt),
  };
}

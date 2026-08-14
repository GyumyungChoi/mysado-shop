import { prisma } from "@/lib/prisma";
import { authenticateApiRequest } from "@/lib/api-v1/auth";
import { checkRateLimit } from "@/lib/api-v1/rate-limit";
import { API_ERROR, apiFailure, apiSuccess } from "@/lib/api-v1/response";
import { API_SCOPE } from "@/lib/api-v1/scopes";
import {
  ORDER_SELECT,
  encodeCursor,
  parseListParams,
  serializeOrder,
} from "@/lib/api-v1/orders";

/**
 * GET /api/v1/orders — 허브의 주문 증분 수집 (읽기 전용).
 *
 * 순서는 ping과 동일하다: 인증 → rate limit → 처리.
 * 정렬은 `updatedAt ASC, id ASC` 고정이며 정렬 파라미터를 받지 않는다(증분 안정성).
 *
 * 응답을 캐시하면 허브가 낡은 목록을 증분으로 받아들인다. 명시적으로 동적 처리를 강제한다.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, [API_SCOPE.ORDERS_READ]);
  if (!auth.ok) {
    console.warn(`/api/v1/orders 인증 실패: ${auth.logReason}`);
    return apiFailure(
      API_ERROR[auth.code],
      "인증에 실패했습니다.",
      auth.code === "FORBIDDEN" ? 403 : 401
    );
  }

  const rate = checkRateLimit(auth.client.id);
  if (!rate.ok) {
    return apiFailure(API_ERROR.RATE_LIMITED, "요청이 너무 많습니다.", 429, {
      "Retry-After": String(rate.retryAfterSec),
    });
  }

  const parsed = parseListParams(new URL(request.url));
  if (!parsed.ok) {
    return apiFailure(API_ERROR.INVALID_REQUEST, parsed.message, 400);
  }

  const { where, limit } = parsed.value;

  // limit + 1 을 읽어 다음 페이지 존재 여부를 별도 count 없이 판정한다.
  const rows = await prisma.order.findMany({
    where,
    select: ORDER_SELECT,
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.length > 0 ? page[page.length - 1] : null;

  return apiSuccess({
    items: page.map(serializeOrder),
    nextCursor: hasMore && last !== null ? encodeCursor(last.updatedAt, last.id) : null,
    hasMore,
  });
}

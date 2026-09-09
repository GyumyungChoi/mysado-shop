import { prisma } from "@/lib/prisma";
import { authenticateApiRequest } from "@/lib/api-v1/auth";
import { checkRateLimit } from "@/lib/api-v1/rate-limit";
import { API_ERROR, apiFailure, apiSuccess, isoWithOffset } from "@/lib/api-v1/response";
import { API_SCOPE } from "@/lib/api-v1/scopes";
import {
  PRODUCT_SELECT,
  parseProductListParams,
  serializeProduct,
} from "@/lib/api-v1/products";

/**
 * GET /api/v1/products — 허브의 상품 목록 조회 (읽기 전용).
 *
 * 순서는 orders 와 동일하다: 인증 → rate limit → 파라미터 → 조회.
 *
 * 페이지네이션이 orders 와 다르다. orders 는 (updatedAt, id) 복합 커서이고
 * 이쪽은 offset 이다. 대신 정렬 키를 **변하지 않는 id** 로 고정해,
 * 페이지 사이에서 행이 이동하는 offset 의 약점을 피한다. 정렬 파라미터는 받지 않는다.
 *
 * 응답을 캐시하면 허브가 낡은 목록을 받아들인다. 명시적으로 동적 처리를 강제한다.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, [API_SCOPE.PRODUCTS_READ]);
  if (!auth.ok) {
    console.warn(`/api/v1/products 인증 실패: ${auth.logReason}`);
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

  const parsed = parseProductListParams(new URL(request.url));
  if (!parsed.ok) {
    return apiFailure(API_ERROR.INVALID_REQUEST, parsed.message, 400);
  }

  const { where, limit, offset } = parsed.value;

  // total 과 페이지를 따로 읽는다. 두 쿼리 사이에 write 가 끼면 total 이 어긋날 수 있으나,
  // 상품 테이블의 write 빈도가 낮고 total 은 페이지 진행 판단용이라 트랜잭션을 걸지 않는다.
  // 이 판단을 사양서에 적는다.
  const total = await prisma.product.count({ where });

  const rows = await prisma.product.findMany({
    where,
    select: PRODUCT_SELECT,
    orderBy: { id: "asc" },
    take: limit,
    skip: offset,
  });

  return apiSuccess({
    items: rows.map(serializeProduct),
    total,
    limit,
    offset,
    generatedAt: isoWithOffset(new Date()),
  });
}

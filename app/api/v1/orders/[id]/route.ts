import { prisma } from "@/lib/prisma";
import { authenticateApiRequest } from "@/lib/api-v1/auth";
import { checkRateLimit } from "@/lib/api-v1/rate-limit";
import { API_ERROR, apiFailure, apiSuccess } from "@/lib/api-v1/response";
import { API_SCOPE } from "@/lib/api-v1/scopes";
import { ORDER_SELECT, serializeOrder } from "@/lib/api-v1/orders";

/**
 * GET /api/v1/orders/{id} — 주문 단건 (읽기 전용).
 *
 * 경로 파라미터는 `Order.id` 다. `orderNumber` 는 nullable이고 Postgres UNIQUE가
 * NULL 중복을 막지 않으므로 경로 키가 될 수 없다(목록의 필터로만 제공).
 *
 * 목록과 같은 ORDER_SELECT·serializeOrder 를 쓴다 — 두 응답이 갈라지지 않게 하는 유일한 방법.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, [API_SCOPE.ORDERS_READ]);
  if (!auth.ok) {
    console.warn(`/api/v1/orders/[id] 인증 실패: ${auth.logReason}`);
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

  // 존재하지 않는 id는 정상 시나리오다 — findUniqueOrThrow 를 쓰지 않는다(auth.ts 규약).
  const row = await prisma.order.findUnique({
    where: { id: params.id },
    select: ORDER_SELECT,
  });
  if (row === null) {
    return apiFailure(API_ERROR.NOT_FOUND, "주문을 찾을 수 없습니다.", 404);
  }

  return apiSuccess(serializeOrder(row));
}

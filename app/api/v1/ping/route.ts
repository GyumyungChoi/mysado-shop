import { authenticateApiRequest } from "@/lib/api-v1/auth";
import { checkRateLimit } from "@/lib/api-v1/rate-limit";
import { API_ERROR, apiFailure, apiSuccess, isoWithOffset } from "@/lib/api-v1/response";

/**
 * GET /api/v1/ping — 인증·봉투·rate limit 경로의 실증용 라우트.
 *
 * 스코프를 요구하지 않는다. 스코프 검사 로직은 auth.ts 에 있고 소비자는
 * 51차(orders:read)·52차(inventory:write)에 붙는다. 대신 클라이언트의 scopes를
 * 그대로 echo 하여 String[] 컬럼의 저장·조회 왕복까지는 실증한다.
 *
 * 순서가 중요하다 — 인증 → rate limit. 미인증 요청이 카운터를 오염시키면 안 되고,
 * 카운터 키가 clientId 이므로 인증 전에는 키 자체가 없다.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) {
    // logReason은 서버 로그에만 남기고 응답 본문에 넣지 않는다.
    console.warn(`/api/v1/ping 인증 실패: ${auth.logReason}`);
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

  return apiSuccess({
    clientName: auth.client.name,
    scopes: auth.client.scopes,
    serverTime: isoWithOffset(new Date()),
  });
}

import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/api-v1/keys";

/**
 * /api/v1 Bearer 인증.
 *
 * 실패는 예외가 아니라 반환값으로 표현한다(클래스·상속 금지 — ES5 컴파일에서
 * Error 상속의 instanceof 판별이 깨진다, 43차 실증).
 *
 * 호출부는 `code` 만으로 응답을 만들고 `logReason` 은 서버 로그에만 남긴다.
 * "키 없음"·"키 틀림"·"폐기됨"을 구분해 응답하면 공격자에게 정보를 준다.
 */

export type ApiAuthClient = { id: string; name: string; scopes: string[] };

export type ApiAuthResult =
  | { ok: true; client: ApiAuthClient }
  | { ok: false; code: "UNAUTHORIZED" | "FORBIDDEN"; logReason: string };

const BEARER_PREFIX = "Bearer ";

/** lastUsedAt 갱신 스로틀 간격 */
const LAST_USED_THROTTLE_MS = 300_000;

/** clientId → 마지막 lastUsedAt 갱신 시각. 프로세스 재시작 시 비는 것은 무해하다. */
const lastUsedTouchedAt = new Map<string, number>();

/**
 * lastUsedAt 갱신 — 스로틀 + fire-and-forget.
 * 감사용 부가 정보이지 인증 요소가 아니므로, 인증 경로를 쓰기 지연·실패에 묶지 않는다.
 */
function touchLastUsedAt(clientId: string): void {
  const now = Date.now();
  const touchedAt = lastUsedTouchedAt.get(clientId);
  if (touchedAt !== undefined && now - touchedAt < LAST_USED_THROTTLE_MS) return;

  lastUsedTouchedAt.set(clientId, now);
  prisma.apiClient
    .update({ where: { id: clientId }, data: { lastUsedAt: new Date(now) } })
    .catch(() => {});
}

/**
 * Authorization: Bearer <키> 를 검증하고 클라이언트를 돌려준다.
 * `requiredScopes` 가 비어 있으면 스코프 검사를 하지 않는다.
 */
export async function authenticateApiRequest(
  request: Request,
  requiredScopes: string[] = []
): Promise<ApiAuthResult> {
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    return { ok: false, code: "UNAUTHORIZED", logReason: "missing_bearer" };
  }

  const plain = header.slice(BEARER_PREFIX.length).trim();
  if (!plain) {
    return { ok: false, code: "UNAUTHORIZED", logReason: "missing_bearer" };
  }

  // 존재하지 않는 키는 정상 시나리오이므로 findUniqueOrThrow 를 쓰지 않는다.
  const client = await prisma.apiClient.findUnique({
    where: { keyHash: hashApiKey(plain) },
  });
  if (!client) {
    return { ok: false, code: "UNAUTHORIZED", logReason: "unknown_key" };
  }

  if (!client.isActive || client.revokedAt !== null) {
    return { ok: false, code: "UNAUTHORIZED", logReason: "revoked" };
  }

  if (requiredScopes.length > 0) {
    const missing = requiredScopes.filter((scope) => !client.scopes.includes(scope));
    if (missing.length > 0) {
      return {
        ok: false,
        code: "FORBIDDEN",
        logReason: `scope_missing:${missing.join(",")}`,
      };
    }
  }

  touchLastUsedAt(client.id);

  return {
    ok: true,
    client: { id: client.id, name: client.name, scopes: client.scopes },
  };
}

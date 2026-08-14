/**
 * /api/v1 스코프 리터럴.
 *
 * 정본은 DB `api_client.scopes`(String[]). 현재 발급된 키는 `["orders:read"]` 1건이다.
 * 라우트에 문자열을 직접 박으면 오타가 403으로만 드러나고, 그 시점에는 원인이
 * 네트워크·키·코드 중 무엇인지 갈리지 않는다.
 *
 * 34차 §5-2가 정의한 나머지 어휘(inventory:read / inventory:write / invoices:write /
 * audit:read)는 소비자가 붙는 세션에 추가한다 — 쓰지 않는 상수를 미리 두지 않는다.
 */
export const API_SCOPE = {
  ORDERS_READ: "orders:read",
} as const;

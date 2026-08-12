import { createHash, randomBytes } from "node:crypto";

/**
 * API 키 생성·해시.
 *
 * 의존성은 `node:crypto` 뿐이다. Prisma·Next를 import하지 않는다 —
 * 발급 스크립트(`scripts/api-client-issue.js`)와 개념을 공유해야 하는데
 * 스크립트는 `@/` 별칭을 해석할 수 없어 이 파일을 require 할 수 없기 때문이다.
 * 그래서 해시 표현은 양쪽에 문자 단위로 복제되어 있다. 한쪽만 바꾸면 인증이 깨진다.
 */

export const API_KEY_PREFIX = "msd_";
export const API_KEY_PREFIX_LENGTH = 12; // "msd_" + 8자

/** 평문 키 생성 — `msd_` + base64url 32자 */
export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(24).toString("base64url");
}

/** 평문 → SHA-256 hex 64자. 발급·검증 양쪽이 반드시 이 함수를 통과한다 */
export function hashApiKey(plain: string): string {
  return createHash("sha256").update(plain, "utf8").digest("hex");
}

/** 감사·식별용 접두 (조회 키가 아니다 — 조회는 keyHash로만 한다) */
export function keyPrefixOf(plain: string): string {
  return plain.slice(0, API_KEY_PREFIX_LENGTH);
}

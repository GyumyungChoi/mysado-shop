import { NextResponse } from "next/server";

/**
 * /api/v1 전용 응답 봉투.
 *
 * 기존 `lib/api-helpers.ts` 의 `{ message }` 형태와는 다른 규약이다.
 * 소비자가 다르기 때문이다 — 내부 라우트는 브라우저, /api/v1 은 외부 프로그램(허브).
 * 기존 라우트를 이 형태로 바꾸지 않는다.
 */

/** /api/v1 오류 코드 — 34차 §5-8 */
export const API_ERROR = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_REQUEST: "INVALID_REQUEST",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL: "INTERNAL",
} as const;

export type ApiErrorCode = (typeof API_ERROR)[keyof typeof API_ERROR];

/** 성공 봉투 — `{ success: true, data }` */
export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * 실패 봉투 — `{ success: false, error: { code, message } }`
 *
 * `extraHeaders` 는 429의 `Retry-After` 처럼 응답 헤더가 필요한 경우에만 쓴다.
 * `error.details` 키는 이번에 넣지 않는다(검증할 소비자가 없다).
 */
export function apiFailure(
  code: ApiErrorCode,
  message: string,
  status: number,
  extraHeaders?: Record<string, string>
): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: extraHeaders }
  );
}

/** 두 자리 0채움 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * `2026-08-12T13:05:22+09:00` 형태로 포맷한다.
 *
 * KST 고정이 아니라 **서버 로컬 오프셋**을 계산해 붙인다.
 * Prisma가 돌려준 Date 객체를 그대로 넣으면 되며, 추가 변환을 하지 않는다.
 */
export function isoWithOffset(d: Date): string {
  // getTimezoneOffset()은 (UTC - 로컬) 분을 준다. KST는 -540이므로 부호를 뒤집는다.
  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetMinutes);
  const offset = `${sign}${pad2(Math.floor(absMinutes / 60))}:${pad2(absMinutes % 60)}`;

  // 오프셋만큼 밀어 UTC로 읽으면 로컬 벽시계 값이 된다(밀리초는 버린다).
  const shifted = new Date(d.getTime() + offsetMinutes * 60_000);
  return `${shifted.toISOString().slice(0, 19)}${offset}`;
}

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * API 로직에서 던지는 에러의 공용 기반 클래스.
 * message는 사용자에게 그대로 노출되고, status는 HTTP 응답 코드가 된다.
 * (CartError 등 도메인별 에러는 이 클래스를 상속)
 */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** 세션을 서버에서 검증하고 userId를 반환, 비로그인이면 null */
export async function getUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: headers() });
  return session?.user.id ?? null;
}

/** ApiError(파생 포함)는 해당 상태코드로, 그 외는 500으로 응답 */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  console.error("API 오류:", error);
  return NextResponse.json(
    { message: "잠시 후 다시 시도해주세요" },
    { status: 500 }
  );
}

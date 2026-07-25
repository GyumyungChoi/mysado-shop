import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getUserId, toErrorResponse, ApiError } from "@/lib/api-helpers";
import { withdrawUser } from "@/lib/withdraw";

interface WithdrawRequestBody {
  password?: string;
}

/**
 * POST /api/mypage/withdraw — 회원 탈퇴 (Phase 7, 30차)
 *
 * 순서:
 *  1. 세션 확인 (비로그인 401)
 *  2. admin 계정 탈퇴 차단 (role === "admin" → 403)
 *  3. 비밀번호 재확인 (auth.api.verifyPassword — 마스킹은 비가역이므로 필수)
 *  4. withdrawUser: 주문 유무로 Hard/Soft 분기 (원자적 트랜잭션)
 *  5. signOut: 현재 브라우저 세션 쿠키 제거 (전 기기 세션은 4에서 이미 무효화)
 */
export async function POST(request: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      throw new ApiError("로그인이 필요합니다.", 401);
    }

    // 1. 대상 회원 조회 + admin 차단
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) {
      throw new ApiError("회원 정보를 찾을 수 없습니다.", 404);
    }
    if (user.role === "admin") {
      throw new ApiError("관리자 계정은 탈퇴할 수 없습니다.", 403);
    }

    // 2. 비밀번호 재확인
    const body = (await request.json().catch(() => ({}))) as WithdrawRequestBody;
    const password = body.password?.trim();
    if (!password) {
      throw new ApiError("비밀번호를 입력해주세요.", 400);
    }
    try {
      await auth.api.verifyPassword({
        body: { password },
        headers: headers(),
      });
    } catch {
      throw new ApiError("비밀번호가 일치하지 않습니다.", 400);
    }

    // 3. 탈퇴 처리 (Hard/Soft 분기)
    const mode = await withdrawUser(userId);

    // 4. 현재 브라우저 세션 쿠키 제거 (DB 세션은 3에서 이미 정리됨)
    await auth.api.signOut({ headers: headers() });

    return NextResponse.json({ message: "탈퇴가 완료되었습니다.", mode });
  } catch (error) {
    return toErrorResponse(error);
  }
}
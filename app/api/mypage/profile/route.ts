import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, toErrorResponse, ApiError } from "@/lib/api-helpers";

interface ProfileRequestBody {
  name?: string;
  phoneNumber?: string;
  marketingAgreed?: boolean;
}

/**
 * PATCH /api/mypage/profile — 내 정보 수정 (Phase 7, 24차)
 *
 * 허용 필드: name / phoneNumber / marketingAgreed (그 외는 무시 — role 등 조작 차단)
 * 이메일은 로그인 식별자라 변경 불가 (인증 도입 후 별도 기능으로)
 *
 * marketingAgreedAt 규칙 (lib/auth.ts의 create 훅과 동일 원리, update는 여기서 담당):
 *  - false -> true 전환 시에만 현재 시각 기록
 *  - 이미 true면 기존 시각 유지 (최초 동의 시점 보존)
 *  - true -> false(철회) 시 null (두 필드 정합 유지)
 */
export async function PATCH(request: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      throw new ApiError("로그인이 필요합니다.", 401);
    }

    const body = (await request.json().catch(() => ({}))) as ProfileRequestBody;

    // ── 1. 검증 + 반영할 필드만 추출 ──
    const data: { name?: string; phoneNumber?: string; marketingAgreed?: boolean; marketingAgreedAt?: Date | null } = {};

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (name.length < 1 || name.length > 50) {
        throw new ApiError("이름은 1~50자로 입력해주세요.", 400);
      }
      data.name = name;
    }

    if (body.phoneNumber !== undefined) {
      // 가입 폼과 동일 규칙: 하이픈·공백 제거 후 010+8자리, 숫자만 저장
      const phoneDigits = body.phoneNumber.replace(/[-\s]/g, "");
      if (!/^010\d{8}$/.test(phoneDigits)) {
        throw new ApiError("휴대폰 번호 형식이 올바르지 않습니다. (예: 010-1234-5678)", 400);
      }
      data.phoneNumber = phoneDigits;
    }

    if (body.marketingAgreed !== undefined) {
      if (typeof body.marketingAgreed !== "boolean") {
        throw new ApiError("요청 형식이 올바르지 않습니다.", 400);
      }
      data.marketingAgreed = body.marketingAgreed;
    }

    if (Object.keys(data).length === 0) {
      throw new ApiError("수정할 항목이 없습니다.", 400);
    }

    // ── 2. 동의 시각 계산 (현재 상태와 비교 필요) ──
    if (data.marketingAgreed !== undefined) {
      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { marketingAgreed: true },
      });
      if (!current) {
        throw new ApiError("회원 정보를 찾을 수 없습니다.", 404);
      }
      if (data.marketingAgreed && !current.marketingAgreed) {
        data.marketingAgreedAt = new Date(); // 신규 동의 — 서버 시계로 기록
      } else if (!data.marketingAgreed) {
        data.marketingAgreedAt = null; // 철회 — 시각도 함께 비움
      }
      // true -> true: marketingAgreedAt 미포함 = 기존 시각 유지
    }

    // ── 3. 반영 ──
    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: { name: true, phoneNumber: true, marketingAgreed: true },
    });

    return NextResponse.json({ message: "저장되었습니다.", user: updated });
  } catch (error) {
    return toErrorResponse(error);
  }
}

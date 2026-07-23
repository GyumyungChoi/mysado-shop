import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, toErrorResponse, ApiError } from "@/lib/api-helpers";
import { parseAddressBody, AddressBody } from "@/lib/address-validation";

/** 배송지 최대 개수 — 무한 등록 방지 */
const MAX_ADDRESSES = 10;

/** GET /api/mypage/addresses — 내 배송지 목록 (기본 배송지 우선, 최신순) */
export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      throw new ApiError("로그인이 필요합니다.", 401);
    }

    const addresses = await prisma.address.findMany({
      where: { userId: userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ addresses: addresses });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/mypage/addresses — 배송지 등록 */
export async function POST(request: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      throw new ApiError("로그인이 필요합니다.", 401);
    }

    const body = (await request.json().catch(() => ({}))) as AddressBody;
    const data = parseAddressBody(body);

    const created = await prisma.$transaction(async (tx) => {
      // 같은 회원의 배송지 변경을 직렬화 (INSERT는 UPDATE로 잠글 수 없으므로 사용자 행을 잠금)
      await tx.$executeRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;

      const count = await tx.address.count({ where: { userId: userId } });
      if (count >= MAX_ADDRESSES) {
        throw new ApiError("배송지는 최대 " + MAX_ADDRESSES + "개까지 등록할 수 있습니다.", 400);
      }

      // 첫 배송지는 요청과 무관하게 기본 배송지로 (기본이 하나도 없는 상태 방지)
      const makeDefault = data.isDefault || count === 0;

      if (makeDefault) {
        await tx.address.updateMany({
          where: { userId: userId },
          data: { isDefault: false },
        });
      }

      return tx.address.create({
        data: {
          userId: userId,
          label: data.label,
          recipientName: data.recipientName,
          recipientPhone: data.recipientPhone,
          zipCode: data.zipCode,
          address1: data.address1,
          address2: data.address2,
          deliveryMemo: data.deliveryMemo,
          isDefault: makeDefault,
        },
      });
    });

    return NextResponse.json({ message: "배송지가 등록되었습니다.", address: created });
  } catch (error) {
    return toErrorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, toErrorResponse, ApiError } from "@/lib/api-helpers";
import { parseAddressBody } from "@/lib/address-validation";

interface RouteContext {
  params: { id: string };
}

/**
 * PATCH /api/mypage/addresses/[id] — 배송지 수정 (전체 필드 교체)
 *
 * isDefault는 true로만 전환 가능. 해제는 다른 배송지를 기본으로 지정할 때 자동 발생.
 * (기본 배송지가 0개인 상태를 만들지 않기 위함)
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await getUserId();
    if (!userId) {
      throw new ApiError("로그인이 필요합니다.", 401);
    }

    const addressId = context.params.id;
    const body = await request.json().catch(() => ({}));
    const data = parseAddressBody(body);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;

      // 소유권 검증 — id만으로 조회하지 않는다
      const target = await tx.address.findFirst({
        where: { id: addressId, userId: userId },
        select: { id: true, isDefault: true },
      });
      if (!target) {
        throw new ApiError("배송지를 찾을 수 없습니다.", 404);
      }

      const makeDefault = data.isDefault || target.isDefault;

      if (makeDefault && !target.isDefault) {
        await tx.address.updateMany({
          where: { userId: userId },
          data: { isDefault: false },
        });
      }

      return tx.address.update({
        where: { id: addressId },
        data: {
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

    return NextResponse.json({ message: "배송지가 수정되었습니다.", address: updated });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * DELETE /api/mypage/addresses/[id] — 배송지 삭제
 *
 * 주문의 배송지는 스냅샷이라 이 삭제에 영향받지 않는다.
 * 기본 배송지를 지우면 남은 것 중 최신 1건을 기본으로 승격.
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const userId = await getUserId();
    if (!userId) {
      throw new ApiError("로그인이 필요합니다.", 401);
    }

    const addressId = context.params.id;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;

      const target = await tx.address.findFirst({
        where: { id: addressId, userId: userId },
        select: { id: true, isDefault: true },
      });
      if (!target) {
        throw new ApiError("배송지를 찾을 수 없습니다.", 404);
      }

      await tx.address.delete({ where: { id: addressId } });

      if (target.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId: userId },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (next) {
          await tx.address.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return NextResponse.json({ message: "배송지가 삭제되었습니다." });
  } catch (error) {
    return toErrorResponse(error);
  }
}

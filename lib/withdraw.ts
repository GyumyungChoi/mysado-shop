import { prisma } from "@/lib/prisma";

/** 탈퇴 처리 결과 — 어느 경로로 처리됐는지 호출부가 알 수 있게 */
export type WithdrawMode = "hard" | "soft";

/**
 * 회원 탈퇴 — 주문 유무로 분기 (설계 결정 70, B++안).
 *
 * - 주문 0건: Hard Delete. User 행을 물리 삭제하면 Cascade가
 *   Session·Account·Address·CartItem을 함께 삭제한다. ProductViewLog·SearchLog는
 *   SetNull로 userId만 비워지고 행은 익명 보존된다. → 완전 파기 + 같은 이메일 재가입 자유.
 *
 * - 주문 1건+: Soft Delete + 마스킹. Order.userId가 Restrict라 물리 삭제가 불가능하고,
 *   전자상거래법상 거래기록 보존 의무가 있다. 로그인 식별정보(email·Account)는 파기하되
 *   거래기록은 Order 스냅샷(주문자·수령인·상품)이 자기완결적으로 보존한다 (설계 결정 69).
 *   ★ SetNull은 실제 행 DELETE 시에만 작동하므로 Soft 경로에선 ProductViewLog·SearchLog의
 *     userId가 마스킹된 회원을 계속 가리킨다. 개인 식별성은 마스킹으로 이미 제거되어 허용.
 *
 * 호출부(route)에서 세션·admin·비밀번호 검증을 마친 뒤 호출하는 것을 전제로 한다.
 * 이 함수는 삭제/마스킹의 원자성만 책임진다(전부 성공 아니면 전부 롤백).
 */
export async function withdrawUser(userId: string): Promise<WithdrawMode> {
  return prisma.$transaction(async (tx) => {
    const orderCount = await tx.order.count({ where: { userId } });

    // 주문 0건 — Hard Delete (Cascade가 자식 행 정리)
    if (orderCount === 0) {
      await tx.user.delete({ where: { id: userId } });
      return "hard";
    }

    // 주문 1건+ — 개인정보 파기 후 User 마스킹 (Order 스냅샷은 건드리지 않음)
    await tx.session.deleteMany({ where: { userId } });   // 전 기기 세션 무효화
    await tx.account.deleteMany({ where: { userId } });   // 비밀번호 해시 소멸
    await tx.address.deleteMany({ where: { userId } });   // 개인정보 밀도 1위 — 보존 의무는 Order가 짊
    await tx.cartItem.deleteMany({ where: { userId } });  // 개인정보 아님, 잔여 정리

    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@deleted.invalid`, // RFC 2606 예약 TLD — 발송 불가 + unique 회피
        name: "탈퇴회원",                            // name은 NOT NULL이라 null 불가
        phoneNumber: null,
        emailVerified: false,
        image: null,
        marketingAgreed: false,                     // 수신 철회
        deletedAt: new Date(),
        // agreedAt·marketingAgreedAt은 유지 — 동의 이력·분쟁 대비 (설계 확정)
      },
    });

    return "soft";
  });
}

import type { Prisma } from "@prisma/client";

/**
 * 재고 차감·복원 전용 모듈 (43차 / 8-2)
 *
 * 핵심 불변식:
 *   order.status === 'PAID'  ⟺  그 주문의 재고가 차감되었다
 *
 * 이 불변식을 지키려면 차감(복원)과 주문 상태 전환이 항상 같은 트랜잭션에 있어야 한다.
 * 그래서 아래 두 함수는 모두 `tx`(트랜잭션 클라이언트)를 주입받는다.
 * 이 파일 안에서 `prisma` 싱글톤을 직접 참조하면 트랜잭션 밖에서 실행되어 불변식이 깨진다.
 *
 * 재고를 쓰는 유일한 지점 — 라우트에서 product.updateMany를 직접 호출하지 않는다.
 */

/** 상품 1종에 대한 차감/복원 단위 */
export interface StockLine {
  productId: string;
  quantity: number;
}

/**
 * 재고 부족 — confirm 라우트가 트랜잭션 롤백 신호로만 사용한다.
 * (webhook 경로는 부족을 허용하므로 이 오류를 쓰지 않는다)
 */
export class StockShortageError extends Error {
  readonly lines: StockLine[];

  constructor(lines: StockLine[]) {
    super(`재고 부족: ${lines.map((l) => l.productId).join(", ")}`);
    this.name = "StockShortageError";
    this.lines = lines;
    // TS 트랜스파일 타깃에 따라 내장 Error 상속 시 instanceof가 깨지는 케이스 방어
    Object.setPrototypeOf(this, StockShortageError.prototype);
  }
}

/**
 * OrderItem 목록 → 차감/복원 단위로 정규화
 *  - productId가 null인 항목 제외 (상품 삭제 후에도 주문 이력을 보존하는 설계)
 *  - 같은 productId가 한 주문에 두 행으로 들어올 수 있으므로 합산
 *  - productId 오름차순 정렬: 상품이 겹치는 동시 주문들이 항상 같은 순서로 행을 잠그게 해
 *    데드락을 회피한다 (순서 고정 자체가 목적)
 */
export function toStockLines(
  items: { productId: string | null; quantity: number }[],
): StockLine[] {
  const merged = new Map<string, number>();

  for (const item of items) {
    if (item.productId === null) continue;
    merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
  }

  const lines: StockLine[] = [];

  // Array.from — tsconfig target이 ES5라 Map 직접 순회 불가(downlevelIteration 미사용)
  for (const [productId, quantity] of Array.from(merged.entries())) {
    if (quantity <= 0) {
      // 정상 흐름에선 발생 불가 — 데이터 이상 신호이므로 남긴다
      console.warn(`[inventory] 수량이 0 이하인 항목 제외 productId=${productId} quantity=${quantity}`);
      continue;
    }
    lines.push({ productId, quantity });
  }

  return lines.sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
}

/**
 * 조건부 재고 차감 — 차감하지 못한 행의 목록을 반환한다(throw하지 않음).
 *
 * `WHERE id = ? AND stock >= n` 조건이 UPDATE 문 안에 있으므로, PostgreSQL이
 * 행 잠금 해제 후 조건을 갱신된 값으로 재평가한다. 따라서 동시 결제에서도
 * 한 쪽만 count = 1이 되고 음수 재고가 발생하지 않는다.
 * (조회 후 JS로 비교하는 패턴으로는 이 보장을 얻을 수 없다)
 *
 * 부분 차감이 남을 수 있다 — 롤백 여부는 호출측 정책이다.
 *  - confirm: 부족 시 throw로 전량 롤백 후 결제 취소
 *  - webhook DONE 보정: 부족을 허용하고 가능한 만큼 차감 + 기록
 */
export async function tryDeductStock(
  tx: Prisma.TransactionClient,
  lines: StockLine[],
): Promise<StockLine[]> {
  const shortage: StockLine[] = [];

  for (const line of lines) {
    // TODO(Phase 10): StockMovement 원장 경유로 전환할 지점 (33차 방침)
    const r = await tx.product.updateMany({
      where: { id: line.productId, stock: { gte: line.quantity } },
      data: { stock: { decrement: line.quantity } },
    });
    // id가 PK라 count는 1을 넘을 수 없다. 상품이 삭제된 경우(count = 0)도 함께 부족으로 처리
    if (r.count !== 1) shortage.push(line);
  }

  return shortage;
}

/** 재고 복원 — 취소 경로 전용. 차감된 주문(PAID)에 대해서만 호출해야 한다. */
export async function restoreStock(
  tx: Prisma.TransactionClient,
  lines: StockLine[],
): Promise<void> {
  for (const line of lines) {
    // update가 아니라 updateMany — 상품 행이 이미 삭제됐어도 예외 없이 넘어가야 한다
    await tx.product.updateMany({
      where: { id: line.productId },
      data: { stock: { increment: line.quantity } },
    });
  }
}

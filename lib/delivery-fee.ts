/**
 * 주문 배송비 산출 — 유료/무료 2종, SKU별 지정 (59차 신설).
 *
 * 복수의 유료배송 상품이 한 주문에 있어도 가장 비싼 배송비 1건만 부과한다 (MAX 규칙, 58차 Chris 확정).
 *
 * 🔴 이 함수가 배송비 산출의 유일한 정본이다.
 *    lib/cart.ts(화면 표시)와 lib/orders.ts(결제 금액 확정)가 반드시 같은 값을 내야 하므로
 *    어느 쪽도 직접 Math.max나 reduce를 쓰지 않는다. 두 경로가 갈리면
 *    화면에 찍힌 금액과 실제 청구 금액이 어긋난다.
 *
 * Math.max(...fees)를 쓰지 않는 이유:
 *   - 빈 배열에서 -Infinity를 돌려준다 (장바구니 전량 품절 시 발생)
 *   - 스프레드는 항목 수가 많을 때 인자 개수 한계에 걸린다
 *
 * @param items 구매 가능 항목의 상품 행만 넘길 것.
 *              주문에서 제외되는 항목의 배송비가 섞이면 청구액이 부풀어 오른다.
 */
export function calcDeliveryFee(items: { deliveryFee: number }[]): number {
  return items.reduce(
    (max, item) => (item.deliveryFee > max ? item.deliveryFee : max),
    0
  );
}

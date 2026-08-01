/** 상품 판매 상태 — 단일 축(status) + isVisible 파생 (37차 ②)
 *
 *  Product.status는 Postgres enum이 아니라 text 컬럼이라 DB가 값을 제약하지
 *  못합니다. 이 모듈의 상수·술어가 실질적인 enum 역할을 합니다.
 *  상태 비교는 반드시 이 술어를 경유하고, 리터럴 직접 비교를 금지합니다.
 *
 *  37차 M1에서 구값(SALE/OUTOFSTOCK)은 DB에서 전량 소멸했고,
 *  M2에서 dual-read를 해제했습니다. 신값만 인정합니다.
 */

/** 신규 상태 (§4-2) */
export const PRODUCT_STATUS = {
  /** 판매중 — 노출·구매 가능. 재고>0에서 자동 전이 */
  ON_SALE: "ON_SALE",
  /** 품절 — 노출 유지(품절 뱃지), 구매 불가. 재고=0에서 자동 전이 */
  SOLD_OUT: "SOLD_OUT",
  /** 단종 — 공급 중단. 비노출, 수동 잠금(재고 유입돼도 자동 해제 안 됨) */
  DISCONTINUED: "DISCONTINUED",
  /** 판매 보류 — 재고는 있으나 내외부 사유. 비노출, 수동 잠금 */
  SUSPENDED: "SUSPENDED",
  /** 등록 준비중 — 신규 INSERT ~ 검수 전. 비노출 */
  DRAFT: "DRAFT",
  /** 운영자 수동 숨김. 비노출 */
  HIDDEN: "HIDDEN",
} as const;

export type ProductStatus = (typeof PRODUCT_STATUS)[keyof typeof PRODUCT_STATUS];

/** 재고 기반 자동 전이 대상 — 수동 잠금 상태와 구분 */
const AUTO_TRANSITION: readonly string[] = [
  PRODUCT_STATUS.ON_SALE,
  PRODUCT_STATUS.SOLD_OUT,
];

const ON_SALE_VALUES: readonly string[] = [PRODUCT_STATUS.ON_SALE];

const VISIBLE_VALUES: readonly string[] = [
  PRODUCT_STATUS.ON_SALE,
  PRODUCT_STATUS.SOLD_OUT,
];

/** 판매중 상태인가 — 재고는 보지 않습니다(호출부 책임) */
export function isOnSaleStatus(status: string): boolean {
  return ON_SALE_VALUES.includes(status);
}

/** 품절 상태인가 */
export function isSoldOutStatus(status: string): boolean {
  return status === PRODUCT_STATUS.SOLD_OUT;
}

/** is_active 파생 규칙 — status write 시 이 값으로 동기화합니다 */
export function deriveIsVisible(status: string): boolean {
  return VISIBLE_VALUES.includes(status);
}

/** 재고 변동으로 자동 전이시켜도 되는 상태인가.
 *  DISCONTINUED·SUSPENDED는 재고가 들어와도 자동 해제되지 않습니다 */
export function isAutoTransitionable(status: string): boolean {
  return AUTO_TRANSITION.includes(status);
}

/** 목록 카드·상세 뱃지 문구. 표시할 것이 없으면 null */
export function getStatusBadgeLabel(status: string, stock: number): string | null {
  if (isSoldOutStatus(status)) return "품절";
  if (isOnSaleStatus(status) && stock <= 0) return "품절";
  return null;
}

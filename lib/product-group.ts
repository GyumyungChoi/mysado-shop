/** ProductGroup 묶음 층 상수·술어 (Phase 7 71차)
 *  DB에 CHECK·enum 이 없으므로(70차 §1-2 실측) 값 판정은 이 술어로만 합니다.
 *  lib/product-status.ts 선례 — 리터럴 직접 비교 금지 */

export const GROUP_ROLE = {
  PRIMARY: "PRIMARY",
  VARIANT: "VARIANT",
} as const;

export type GroupRole = (typeof GROUP_ROLE)[keyof typeof GROUP_ROLE];

/** 묶음 대표 상품인가 — null·미지의 값은 false */
export function isPrimary(role: string | null): boolean {
  return role === GROUP_ROLE.PRIMARY;
}

/** 묶음 변형 상품인가 — null·미지의 값은 false */
export function isVariant(role: string | null): boolean {
  return role === GROUP_ROLE.VARIANT;
}

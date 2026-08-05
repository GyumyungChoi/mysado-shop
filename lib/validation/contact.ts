/**
 * 연락처·우편번호 검증 공용 모듈 (Phase 7, 44차)
 *
 * 서버(lib/orders.ts · lib/address-validation.ts)와 입력 폼이 **같은 규칙**을 쓰게 한다.
 * 44차 이전에는 두 서버 모듈이 각자 `replace(/[-\s]/g, "")` 로 정규화해
 * `010.1234.5678` 같은 입력이 표시(format-phone.ts는 `[^0-9]` 기준)는 정상인데
 * 검증만 400으로 떨어졌다. 정규화 기준을 `[^0-9]` 하나로 통일한다.
 *
 * ⚠️ Prisma·서버 전용 모듈을 import 하지 않는다 — 클라이언트 컴포넌트가 직접 import 하므로
 *    의존이 생기면 번들이 깨진다. `"use client"` 도 붙이지 않는다(양쪽에서 쓰는 중립 모듈).
 */

/** 숫자 이외 전부 제거 — format-phone.ts:19와 동일 기준 */
function toDigits(value: string | null | undefined): string {
  return value ? value.replace(/[^0-9]/g, "") : "";
}

/**
 * 전화번호 정규형 — 숫자만 남긴다. 저장값도 이 형태여야 한다.
 * (DB에 하이픈이 섞이면 같은 번호가 두 형태로 공존한다 — format-phone.ts 주석 참고)
 */
export function normalizePhone(value: string | null | undefined): string {
  return toDigits(value);
}

/** 우편번호 정규형 — 숫자만 남긴다. 검증과 저장이 같은 값을 보도록 분리해 둔다. */
export function normalizeZipCode(value: string | null | undefined): string {
  return toDigits(value);
}

/**
 * 배송지 수취인 연락처 — **유선번호 허용**. 수취인이 휴대폰이 아닐 수 있고
 * 택배 기사 연락은 유선으로도 성립하므로 0으로 시작하는 9~11자리를 모두 받는다.
 *
 * 국가코드가 붙은 `+82 10-1234-5678` 은 정규화 시 `821012345678`(12자리)이 되어
 * 여전히 탈락한다 — 의도된 동작(44차 범위 밖).
 */
export function isValidRecipientPhone(value: string | null | undefined): boolean {
  return /^0\d{8,10}$/.test(normalizePhone(value));
}

/**
 * 회원 연락처 — **휴대폰 전용**. 본인 식별과 향후 SMS 인증에 쓰이므로
 * 유선번호를 받으면 안 된다. 010/011/016/017/018/019 + 7~8자리.
 *
 * 44차에는 정의만 둔다(회원 경로 파일은 이번 범위가 아님 — 지시서 §2).
 */
export function isValidMemberPhone(value: string | null | undefined): boolean {
  return /^01[016789]\d{7,8}$/.test(normalizePhone(value));
}

/** 우편번호 — 5자리 숫자(도로명 주소 체계) */
export function isValidZipCode(value: string | null | undefined): boolean {
  return /^\d{5}$/.test(normalizeZipCode(value));
}

/** 에러 문구 — 서버 400 응답과 폼 인라인 에러가 같은 상수를 쓴다 */
// 배송지는 유선 허용이므로 예시에 02 번호를 함께 든다 — 010만 보이면 유선 수취인이 못 쓴다고 오해한다
export const RECIPIENT_PHONE_ERROR =
  "연락처를 다시 확인해주세요. 010-1234-5678 또는 02-123-4567 형식으로 입력해주세요.";
export const MEMBER_PHONE_ERROR =
  "휴대폰 번호를 다시 확인해주세요. 010으로 시작하는 번호를 입력해주세요.";
export const ZIP_ERROR = "우편번호를 다시 확인해주세요. 5자리 숫자여야 합니다.";

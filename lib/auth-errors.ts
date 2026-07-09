/**
 * Better Auth 에러 코드 → 한국어 메시지 매핑
 * 코드 목록 참고: better-auth 의 ERROR_CODES
 */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  // 로그인
  INVALID_EMAIL_OR_PASSWORD: "이메일 또는 비밀번호가 올바르지 않습니다.",
  USER_NOT_FOUND: "가입되지 않은 이메일입니다.",
  EMAIL_NOT_VERIFIED: "이메일 인증이 완료되지 않았습니다.",

  // 가입
  USER_ALREADY_EXISTS: "이미 가입된 이메일입니다.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "이미 가입된 이메일입니다.",
  INVALID_EMAIL: "올바른 이메일 형식이 아닙니다.",
  PASSWORD_TOO_SHORT: "비밀번호는 8자 이상이어야 합니다.",
  PASSWORD_TOO_LONG: "비밀번호가 너무 깁니다.",


  // 세션/기타
  SESSION_EXPIRED: "로그인이 만료되었습니다. 다시 로그인해주세요.",
  FAILED_TO_CREATE_USER: "회원가입 처리 중 오류가 발생했습니다.",
  FAILED_TO_CREATE_SESSION: "로그인 처리 중 오류가 발생했습니다.",
};

/** 에러 코드(없으면 undefined)를 받아 한국어 메시지 반환 */
export function getAuthErrorMessage(code?: string | null): string {
  if (code && AUTH_ERROR_MESSAGES[code]) {
    return AUTH_ERROR_MESSAGES[code];
  }
  return "요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
}
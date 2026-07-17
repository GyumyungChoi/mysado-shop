// lib/payment.ts
// 토스페이먼츠 서버 API 호출 격리 파일 (01_payment.md 보안 규칙 구현)
// - 시크릿 키는 이 파일(서버 전용)에서만 사용
// - 승인/취소 호출은 절대 throw하지 않고 결과 객체 반환

/** 설계 결정 ③: PaymentLog.type은 String 컬럼 + as const 상수로 관리 */
export const PAYMENT_LOG_TYPE = {
  CONFIRM_SUCCESS: "CONFIRM_SUCCESS", // 승인 성공
  CONFIRM_FAIL: "CONFIRM_FAIL",       // 승인 실패 (토스 거절/네트워크)
  WEBHOOK: "WEBHOOK",                 // 웹훅 수신 (T-5)
  CANCEL: "CANCEL",                   // 결제 취소 (T-5)
} as const;

export type PaymentLogType =
  (typeof PAYMENT_LOG_TYPE)[keyof typeof PAYMENT_LOG_TYPE];

/** 토스 승인 API 성공 응답 중 우리가 사용하는 필드만 발췌한 타입 */
export interface TossPaymentObject {
  paymentKey: string;
  orderId: string;
  status: string;           // "DONE" 등
  totalAmount: number;
  approvedAt: string | null;
  method: string | null;    // "카드", "간편결제" 등
  [key: string]: unknown;   // 나머지 필드는 payload 원문 보존용
}

interface TossErrorBody {
  code: string;
  message: string;
}

export type ConfirmResult =
  | { ok: true; payment: TossPaymentObject }
  | { ok: false; code: string; message: string; httpStatus: number; raw: unknown };

/**
 * 토스 결제 승인 API 호출 (POST /v1/payments/confirm)
 * - Basic 인증: base64(시크릿키 + ":")
 * - Idempotency-Key: paymentKey 사용 — 동일 결제의 중복 승인 요청을 토스가 멱등 처리
 */
export async function confirmTossPayment(params: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<ConfirmResult> {
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    return {
      ok: false,
      code: "CONFIG_ERROR",
      message: "결제 설정 오류입니다. 관리자에게 문의해주세요.",
      httpStatus: 500,
      raw: null,
    };
  }

  const basicAuth = Buffer.from(`${secretKey}:`).toString("base64");

  try {
    const response = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
        "Idempotency-Key": params.paymentKey,
      },
      body: JSON.stringify(params),
    });

    const body = (await response.json()) as unknown;

    if (!response.ok) {
      const err = body as TossErrorBody;
      return {
        ok: false,
        code: err.code ?? "UNKNOWN",
        message: tossErrorToKorean(err.code, err.message),
        httpStatus: response.status,
        raw: body,
      };
    }

    return { ok: true, payment: body as TossPaymentObject };
  } catch (e) {
    // 네트워크 장애 등 — 승인 여부 불명 상태이므로 재시도 유도 문구
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message: "결제 승인 중 통신 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      httpStatus: 500,
      raw: { message },
    };
  }
}

/** PG 에러코드 → 사용자 친화적 한국어 메시지 (01_payment.md 요구사항) */
export function tossErrorToKorean(code: string | undefined, fallback: string): string {
  const messages: Record<string, string> = {
    ALREADY_PROCESSED_PAYMENT: "이미 처리된 결제입니다.",
    NOT_FOUND_PAYMENT: "결제 정보를 찾을 수 없습니다. 처음부터 다시 시도해주세요.",
    NOT_FOUND_PAYMENT_SESSION: "결제 시간이 만료되었습니다. 처음부터 다시 시도해주세요.",
    REJECT_CARD_PAYMENT: "카드 결제가 거절되었습니다. 카드사에 문의하거나 다른 카드를 이용해주세요.",
    REJECT_CARD_COMPANY: "카드사에서 결제를 거절했습니다. 카드사에 문의해주세요.",
    INVALID_CARD_EXPIRATION: "카드 유효기간이 올바르지 않습니다.",
    INVALID_STOPPED_CARD: "정지된 카드입니다. 다른 카드를 이용해주세요.",
    EXCEED_MAX_DAILY_PAYMENT_COUNT: "일일 결제 한도를 초과했습니다.",
    BELOW_MINIMUM_AMOUNT: "결제 가능한 최소 금액 미만입니다.",
    EXCEED_MAX_CARD_INSTALLMENT_PLAN: "설정 가능한 최대 할부 개월 수를 초과했습니다.",
    NOT_SUPPORTED_INSTALLMENT_PLAN_CARD_OR_MERCHANT: "할부가 지원되지 않는 카드 또는 가맹점입니다.",
    INVALID_API_KEY: "결제 설정 오류입니다. 관리자에게 문의해주세요.",
    UNAUTHORIZED_KEY: "결제 설정 오류입니다. 관리자에게 문의해주세요.",
    FDS_ERROR: "위험 거래가 감지되어 결제가 중단되었습니다. 토스페이먼츠(1544-7772)로 문의해주세요.",
    PROVIDER_ERROR: "결제 기관 오류입니다. 잠시 후 다시 시도해주세요.",
  };
  return (code && messages[code]) ?? fallback ?? "결제 처리 중 오류가 발생했습니다.";
}

import { ApiError } from "@/lib/api-helpers";
import {
  normalizePhone,
  normalizeZipCode,
  isValidRecipientPhone,
  isValidZipCode,
  RECIPIENT_PHONE_ERROR,
  ZIP_ERROR,
} from "@/lib/validation/contact";

/**
 * 배송지 입력 검증 공용 모듈 (Phase 7)
 * - route.ts는 HTTP 메서드만 export 가능하므로 검증 로직은 여기에 둔다
 * - 사용처: 배송지 CRUD API. 체크아웃 개편 시 재사용 예정
 */

export interface AddressBody {
  label?: string;
  recipientName?: string;
  recipientPhone?: string;
  zipCode?: string;
  address1?: string;
  address2?: string;
  deliveryMemo?: string;
  isDefault?: boolean;
}

/** 입력 검증 — 통과 시 저장할 값만 반환 (userId 등 조작 차단) */
export function parseAddressBody(body: AddressBody) {
  const recipientName = (body.recipientName || "").trim();
  if (recipientName.length < 1 || recipientName.length > 50) {
    throw new ApiError("받는 분 이름을 1~50자로 입력해주세요.", 400);
  }

  // 정규화·검증 규칙은 lib/validation/contact.ts가 정본 (44차 통일).
  // 저장값은 반드시 정규형(숫자만) — 검증한 값과 저장한 값이 어긋나지 않도록 같은 변수를 쓴다.
  const recipientPhone = normalizePhone(body.recipientPhone);
  if (!isValidRecipientPhone(recipientPhone)) {
    throw new ApiError(RECIPIENT_PHONE_ERROR, 400);
  }

  const zipCode = normalizeZipCode(body.zipCode);
  if (!isValidZipCode(zipCode)) {
    throw new ApiError(ZIP_ERROR, 400);
  }

  const address1 = (body.address1 || "").trim();
  if (address1.length < 1 || address1.length > 200) {
    throw new ApiError("주소를 우편번호 찾기로 입력해주세요.", 400);
  }

  const address2 = (body.address2 || "").trim();
  if (address2.length > 100) {
    throw new ApiError("상세주소는 100자 이내로 입력해주세요.", 400);
  }

  const label = (body.label || "").trim();
  if (label.length > 20) {
    throw new ApiError("배송지 이름은 20자 이내로 입력해주세요.", 400);
  }

  const deliveryMemo = (body.deliveryMemo || "").trim();
  if (deliveryMemo.length > 100) {
    throw new ApiError("배송 메모는 100자 이내로 입력해주세요.", 400);
  }

  return {
    label: label || null,
    recipientName: recipientName,
    recipientPhone: recipientPhone,
    zipCode: zipCode,
    address1: address1,
    address2: address2 || null,
    deliveryMemo: deliveryMemo || null,
    isDefault: body.isDefault === true,
  };
}

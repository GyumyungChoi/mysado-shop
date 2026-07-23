import { ApiError } from "@/lib/api-helpers";

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

  const recipientPhone = (body.recipientPhone || "").replace(/[-\s]/g, "");
  if (!/^0\d{8,10}$/.test(recipientPhone)) {
    throw new ApiError("연락처 형식이 올바르지 않습니다. (예: 010-1234-5678)", 400);
  }

  const zipCode = (body.zipCode || "").trim();
  if (!/^\d{5}$/.test(zipCode)) {
    throw new ApiError("우편번호는 우편번호 찾기로 입력해주세요.", 400);
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

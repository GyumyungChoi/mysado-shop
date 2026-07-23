/**
 * 카카오(다음) 우편번호 서비스 공용 모듈 (Phase 7, 27차)
 *
 * - 앱 키 불필요 — 키가 필요한 것은 카카오맵 API이고 우편번호 서비스는 별개
 * - 스크립트 URL에 파라미터 금지 / 로고 가리기 금지 / 스크립트 임의 수정 금지 (카카오 정책)
 * - 팝업 실행은 components/PostcodeSearchButton.tsx가 담당하고,
 *   여기는 클라이언트 안전한 타입·상수·정규화 함수만 둔다
 */

/** 스크립트 URL — 파라미터를 붙이면 호출이 거부되므로 그대로 사용할 것 */
export const POSTCODE_SCRIPT =
  "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

// 외부 스크립트라 타입 정의가 없어 필요한 필드만 직접 선언한다
export interface PostcodeData {
  zonecode: string;
  roadAddress: string;
  jibunAddress: string;
}

export interface PostcodeInstance {
  open: () => void;
}

export interface PostcodeWindow {
  daum?: {
    Postcode?: new (options: {
      oncomplete: (data: PostcodeData) => void;
    }) => PostcodeInstance;
  };
}

/** 팝업 결과를 우리 스키마 필드명으로 정규화 (zonecode→zipCode, 도로명 우선) */
export function pickAddress(data: PostcodeData): {
  zipCode: string;
  address1: string;
} {
  return {
    zipCode: data.zonecode,
    address1: data.roadAddress || data.jibunAddress,
  };
}

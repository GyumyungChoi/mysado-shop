/**
 * 배송 메모 선택지 (Phase 7, 26차)
 *
 * 배송지 등록/수정과 체크아웃이 같은 목록을 써야 표시가 어긋나지 않으므로 공용 모듈로 둔다.
 * 실제 저장값은 문자열 그대로 — 스키마 변경 없음.
 * "직접 입력"은 값이 아니라 UI 분기용 표지(DELIVERY_MEMO_CUSTOM)로만 쓴다.
 */
export const DELIVERY_MEMO_CUSTOM = "__custom__";

export const DELIVERY_MEMO_OPTIONS = [
  "문 앞에 놓아주세요",
  "경비실에 맡겨주세요",
  "택배함에 넣어주세요",
  "배송 전 연락 바랍니다",
];

/**
 * 배송지 정보 — Order 모델의 배송지 스냅샷 필드와 1:1 대응 (설계 결정 ②)
 * 폼 / 검증 / API 요청·응답이 전부 이 인터페이스만 바라본다.
 * 향후 UserAddress(자주 쓰는 배송지) 테이블을 분리해도 이 타입은 유지.
 */
export interface ShippingInfo {
  recipientName: string;   // 수령인 이름
  recipientPhone: string;  // 수령인 연락처 (숫자만, 0 시작 9~11자리 — 유선번호 허용)
  zipCode: string;         // 우편번호
  address1: string;        // 기본 주소
  address2?: string;       // 상세 주소 (선택)
  deliveryMemo?: string;   // 배송 메모 (선택)
}

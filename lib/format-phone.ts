/**
 * 전화번호 표시 포맷 (Phase 7, 26차)
 *
 * 저장은 숫자만(정규형), 표시할 때만 하이픈 — format-date.ts(㊻)와 같은 원칙.
 * DB에 하이픈을 넣으면 같은 번호가 두 형태로 공존해 중복 탐지가 불가능해진다
 * (Phase 10 phoneNumber unique 제약의 선행 조건).
 *
 * 규칙: 뒤 4자리 고정 + 앞자리(02는 2, 12자리는 4, 그 외 3) 고정, 중간은 나머지 전부.
 *   01012345678   -> 010-1234-5678
 *   021234567     -> 02-123-4567
 *   0311234567    -> 031-123-4567
 *   050712345678  -> 0507-1234-5678
 */
export function formatPhone(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const digits = value.replace(/[^0-9]/g, "");

  // 규격 밖(해외번호·오입력 등)은 원본을 그대로 노출 — 임의 가공은 오히려 오해를 부른다
  if (digits.length < 9 || digits.length > 12) {
    return value;
  }

  let head = 3;
  if (digits.slice(0, 2) === "02") {
    head = 2;
  } else if (digits.length === 12) {
    head = 4;
  }

  const first = digits.slice(0, head);
  const last = digits.slice(-4);
  const middle = digits.slice(head, digits.length - 4);

  if (!middle) {
    return digits;
  }

  return first + "-" + middle + "-" + last;
}

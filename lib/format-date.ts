// KST 고정 날짜 포맷 유틸 (Phase 7 / 25차)
// 서버 OS 타임존과 무관하게 항상 Asia/Seoul 기준으로 출력한다.
// 주문번호 발급(lib/orders.ts, 설계 결정 26)과 동일한 "KST 명시" 원칙의 표시 계층 버전.
// hourCycle "h23": 자정을 24:00이 아닌 00:00으로 보장 (스펙 명시 옵션).

const DATE_TIME_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function pick(parts: Intl.DateTimeFormatPart[], type: string): string {
  const found = parts.find(function (p) {
    return p.type === type;
  });
  return found ? found.value : "";
}

// "2026.07.21 22:36" — 주문 시각 표시용 (허브 최근 주문 / mypage 주문 내역 / admin 주문 목록)
export function formatDateTime(value: Date | string): string {
  const parts = DATE_TIME_FMT.formatToParts(toDate(value));
  return (
    pick(parts, "year") + "." + pick(parts, "month") + "." + pick(parts, "day") +
    " " + pick(parts, "hour") + ":" + pick(parts, "minute")
  );
}

// "2026.07.21" — 시각이 불필요한 곳 (가입일 등)
export function formatDate(value: Date | string): string {
  const parts = DATE_FMT.formatToParts(toDate(value));
  return pick(parts, "year") + "." + pick(parts, "month") + "." + pick(parts, "day");
}

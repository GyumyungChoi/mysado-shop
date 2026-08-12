/**
 * /api/v1 요청량 제한 — 인메모리 고정 윈도(fixed window).
 *
 * pm2가 fork 모드 단일 프로세스로 확인되어 인메모리로 충분하다(클러스터였다면 불가).
 * 슬라이딩 윈도는 현재 요구(10분 주기 2호출)에 과하므로 쓰지 않는다.
 *
 * 모듈 스코프 Map은 Next dev의 HMR로 재생성될 수 있다. 정상이며 대응하지 않는다.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

/** Map이 이 크기를 넘으면 만료 항목을 청소한다(무한 증가 경로 차단) */
const CLEANUP_THRESHOLD = 1000;

export type RateResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number };

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

/** 윈도가 지난 항목을 제거한다. Map이 커졌을 때만 호출된다. */
function cleanupExpired(now: number): void {
  const expired: string[] = [];
  buckets.forEach((bucket, key) => {
    if (now - bucket.windowStart >= WINDOW_MS) expired.push(key);
  });
  expired.forEach((key) => buckets.delete(key));
}

/** 클라이언트 단위 호출 허용 여부. 호출될 때마다 카운터가 1 증가한다. */
export function checkRateLimit(clientId: string): RateResult {
  const now = Date.now();

  if (buckets.size > CLEANUP_THRESHOLD) cleanupExpired(now);

  const bucket = buckets.get(clientId);

  // 최초 요청이거나 윈도가 지났으면 새 윈도를 연다.
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(clientId, { count: 1, windowStart: now });
    return { ok: true, remaining: MAX_REQUESTS - 1 };
  }

  if (bucket.count >= MAX_REQUESTS) {
    const elapsed = now - bucket.windowStart;
    return { ok: false, retryAfterSec: Math.ceil((WINDOW_MS - elapsed) / 1000) };
  }

  bucket.count += 1;
  return { ok: true, remaining: MAX_REQUESTS - bucket.count };
}

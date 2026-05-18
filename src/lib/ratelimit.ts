// 단일 인스턴스용 인메모리 sliding-window rate limiter.
// 다중 인스턴스/서버리스에서는 Redis 같은 외부 저장소로 교체 필요.

interface Bucket {
  hits: number[]; // 최근 hit 타임스탬프(ms)
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000; // 메모리 방어

function evictIfNeeded() {
  if (buckets.size <= MAX_KEYS) return;
  // 오래된 키 일부 정리
  const cutoff = Date.now() - 10 * 60_000;
  for (const [k, b] of buckets) {
    if (b.hits.length === 0 || b.hits[b.hits.length - 1] < cutoff) buckets.delete(k);
  }
}

/**
 * windowMs 동안 limit 회 초과 시 false.
 * @returns true = 허용, false = 차단. remaining 도 함께 반환.
 */
export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const cutoff = now - opts.windowMs;

  let b = buckets.get(key);
  if (!b) {
    b = { hits: [] };
    buckets.set(key, b);
    evictIfNeeded();
  }

  // 윈도우 밖 hit 제거
  while (b.hits.length > 0 && b.hits[0] < cutoff) b.hits.shift();

  if (b.hits.length >= opts.limit) {
    const oldest = b.hits[0];
    const retryAfterMs = oldest + opts.windowMs - now;
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
  }

  b.hits.push(now);
  return { allowed: true, remaining: opts.limit - b.hits.length, retryAfterMs: 0 };
}

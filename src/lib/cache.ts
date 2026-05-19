// 캐시 — Redis(있으면) / 메모리 LRU(없으면) 폴백

interface Entry<V> { value: V; expiresAt: number }
const MAX_KEYS = 1000;
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = !!(REDIS_URL && REDIS_TOKEN);

export class MemoryCache<V> {
  private store = new Map<string, Entry<V>>();
  constructor(private defaultTtlMs: number = 15_000) {}

  get(key: string): V | null {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt < Date.now()) { this.store.delete(key); return null; }
    this.store.delete(key); this.store.set(key, e);
    return e.value;
  }

  set(key: string, value: V, ttlMs?: number) {
    if (this.store.size >= MAX_KEYS) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs) });
  }

  invalidate(prefix?: string) {
    if (!prefix) { this.store.clear(); return; }
    for (const k of this.store.keys()) if (k.startsWith(prefix)) this.store.delete(k);
  }
}

const memCache = new MemoryCache<unknown>(15_000);

// 비동기 인터페이스 — Redis 또는 메모리
export async function cacheGet(key: string): Promise<unknown | null> {
  if (!useRedis) return memCache.get(key);
  try {
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    if (data?.result == null) return null;
    return JSON.parse(data.result);
  } catch {
    return memCache.get(key);
  }
}

export async function cacheSet(key: string, value: unknown, ttlMs: number = 15_000): Promise<void> {
  if (!useRedis) { memCache.set(key, value, ttlMs); return; }
  try {
    const seconds = Math.ceil(ttlMs / 1000);
    await fetch(`${REDIS_URL}/setex/${encodeURIComponent(key)}/${seconds}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
  } catch {
    memCache.set(key, value, ttlMs);
  }
}

// (legacy) 기존 동기 인터페이스
export const dashboardCache = memCache;

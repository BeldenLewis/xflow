// 단순 in-memory LRU 캐시 — 짧은 TTL 로 자주 호출되는 집계 결과 캐싱
// 다중 인스턴스 환경에선 일관성 보장 안 됨. 짧은 TTL 로 보완.

interface Entry<V> {
  value: V;
  expiresAt: number;
}

const MAX_KEYS = 1000;

export class MemoryCache<V> {
  private store = new Map<string, Entry<V>>();

  constructor(private defaultTtlMs: number = 15_000) {}

  get(key: string): V | null {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt < Date.now()) { this.store.delete(key); return null; }
    // LRU: 가장 최근 접근으로 옮기기
    this.store.delete(key);
    this.store.set(key, e);
    return e.value;
  }

  set(key: string, value: V, ttlMs?: number) {
    if (this.store.size >= MAX_KEYS) {
      // 가장 오래된 항목 제거
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

export const dashboardCache = new MemoryCache<unknown>(15_000); // 15초 TTL

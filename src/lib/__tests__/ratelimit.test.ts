import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/ratelimit";

function uniqueKey(prefix: string) {
  return `${prefix}:${Math.random().toString(36).slice(2)}:${Date.now()}`;
}

describe("rateLimit (memory)", () => {
  it("allows requests under the limit", () => {
    const key = uniqueKey("under");
    const opts = { limit: 3, windowMs: 1000 };
    expect(rateLimit(key, opts).allowed).toBe(true);
    expect(rateLimit(key, opts).allowed).toBe(true);
  });

  it("allows up to the limit then rejects", () => {
    const key = uniqueKey("at");
    const opts = { limit: 3, windowMs: 1000 };
    expect(rateLimit(key, opts).allowed).toBe(true);
    expect(rateLimit(key, opts).allowed).toBe(true);
    const third = rateLimit(key, opts);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    const fourth = rateLimit(key, opts);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.retryAfterMs).toBeGreaterThanOrEqual(0);
  });

  it("resets after the window elapses", async () => {
    const key = uniqueKey("reset");
    const opts = { limit: 2, windowMs: 50 };
    expect(rateLimit(key, opts).allowed).toBe(true);
    expect(rateLimit(key, opts).allowed).toBe(true);
    expect(rateLimit(key, opts).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 80));
    expect(rateLimit(key, opts).allowed).toBe(true);
  });

  it("isolates separate keys", () => {
    const a = uniqueKey("a");
    const b = uniqueKey("b");
    const opts = { limit: 1, windowMs: 1000 };
    expect(rateLimit(a, opts).allowed).toBe(true);
    expect(rateLimit(a, opts).allowed).toBe(false);
    // b should still be allowed
    expect(rateLimit(b, opts).allowed).toBe(true);
  });
});

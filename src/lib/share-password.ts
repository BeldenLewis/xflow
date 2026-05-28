import { createHash, randomBytes } from "node:crypto";
import "server-only";

// salt:hash 형식. 단순 sha256 + salt (공유 페이지 보호용으로 충분).
export function hashSharePassword(password: string): string {
  const salt = randomBytes(8).toString("hex");
  const hash = createHash("sha256").update(`${salt}${password}`).digest("hex");
  return `${salt}:${hash}`;
}

export function verifySharePassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return true; // 비번 미설정 = 검증 통과
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = createHash("sha256").update(`${salt}${password}`).digest("hex");
  return actual === expected;
}

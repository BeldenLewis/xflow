// SSRF 방어 — 사용자가 입력한 URL 을 fetch 하기 전 검증.
// 사설 IP, 메타데이터 엔드포인트, 비표준 스킴 차단.

const PRIVATE_HOST_LITERALS = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
]);

function ipv4ToOctets(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = [m[1], m[2], m[3], m[4]].map((n) => Number(n));
  if (parts.some((n) => n < 0 || n > 255)) return null;
  return parts;
}

function isPrivateIPv4(host: string): boolean {
  const octets = ipv4ToOctets(host);
  if (!octets) return false;
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local (AWS/GCP metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(host: string): boolean {
  // IPv6 in URL hostname has brackets stripped already by URL parser
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // ULA fc00::/7
  if (h.startsWith("fe80")) return true; // link-local
  if (h.startsWith("::ffff:")) {
    // IPv4-mapped
    const v4 = h.slice("::ffff:".length);
    return isPrivateIPv4(v4);
  }
  return false;
}

export function isPrivateHostname(hostname: string): boolean {
  if (!hostname) return true;
  const h = hostname.toLowerCase();
  if (PRIVATE_HOST_LITERALS.has(h)) return true;
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return true;
  if (isPrivateIPv4(h)) return true;
  if (h.includes(":") && isPrivateIPv6(h)) return true;
  return false;
}

export interface SafeUrlResult {
  ok: boolean;
  reason?: string;
  url?: URL;
}

export function isSafePublicUrl(rawUrl: string, opts?: { allowHttp?: boolean }): SafeUrlResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "잘못된 URL 형식이에요" };
  }
  const allowedSchemes = opts?.allowHttp ? ["http:", "https:"] : ["https:"];
  if (!allowedSchemes.includes(url.protocol)) {
    return { ok: false, reason: "허용되지 않은 스킴" };
  }
  if (isPrivateHostname(url.hostname)) {
    return { ok: false, reason: "내부/사설 호스트로의 접근은 차단됐어요" };
  }
  return { ok: true, url };
}

// 안전한 fetch — redirect 수동 처리, 각 hop 마다 isSafePublicUrl 재검증.
export async function safeFetch(
  rawUrl: string,
  init: RequestInit & { timeoutMs?: number; allowHttp?: boolean; maxRedirects?: number } = {},
): Promise<Response> {
  const { timeoutMs = 5000, allowHttp, maxRedirects = 3, ...fetchInit } = init;
  let current = rawUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    const safe = isSafePublicUrl(current, { allowHttp });
    if (!safe.ok || !safe.url) throw new Error(safe.reason ?? "SSRF blocked");
    const res = await fetch(safe.url, {
      ...fetchInit,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      current = new URL(loc, safe.url).toString();
      continue;
    }
    return res;
  }
  throw new Error("redirect 횟수가 너무 많아요");
}

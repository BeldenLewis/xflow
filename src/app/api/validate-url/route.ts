import { NextResponse } from "next/server";
import { isSafePublicUrl } from "@/lib/url-safety";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) return NextResponse.json({ valid: false });

  const safe = isSafePublicUrl(url, { allowHttp: true });
  if (!safe.ok || !safe.url) {
    return NextResponse.json({ valid: false, reason: safe.reason });
  }

  try {
    // redirect: "manual" — 사설 IP 로의 리다이렉트로 SSRF 우회를 막음.
    const res = await fetch(safe.url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    // 3xx 는 사설 IP 로 흘러갈 수 있으니 별도 처리 — Location 만 검증해 응답.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (loc) {
        try {
          const next = new URL(loc, safe.url);
          const nextSafe = isSafePublicUrl(next.toString(), { allowHttp: true });
          if (!nextSafe.ok) {
            return NextResponse.json({ valid: false, reason: "내부 호스트로 리다이렉트" });
          }
        } catch {
          /* ignore */
        }
      }
      return NextResponse.json({ valid: true, status: res.status, redirect: true });
    }
    return NextResponse.json({ valid: res.ok, status: res.status });
  } catch {
    return NextResponse.json({ valid: false, unreachable: true });
  }
}

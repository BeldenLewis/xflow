import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) return NextResponse.json({ valid: false });

  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(4000),
    });
    return NextResponse.json({ valid: res.ok, status: res.status });
  } catch {
    return NextResponse.json({ valid: false, unreachable: true });
  }
}

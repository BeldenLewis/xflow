import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 단순 헬스체크 — DB 도달 가능 + 응답 시간.
// 외부 모니터링(UptimeRobot 등) 또는 운영 점검에 사용.
export async function GET() {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const elapsed = Date.now() - start;
    return NextResponse.json({
      status: "ok",
      db: "reachable",
      latencyMs: elapsed,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({
      status: "degraded",
      db: "unreachable",
      error: e instanceof Error ? e.message : String(e),
      timestamp: new Date().toISOString(),
    }, { status: 503 });
  }
}

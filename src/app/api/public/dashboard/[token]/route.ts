import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";

// 공유 토큰으로 보드 정보 + 위젯 목록 반환 (인증 불필요)
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // 토큰 형식 검증: base64url 24바이트 → 32자 이상
  if (!token || token.length < 32 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return NextResponse.json({ error: "잘못된 토큰" }, { status: 400 });
  }

  // IP 기준 brute-force 방지
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = rateLimit(`share-token:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦아요" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  const dashboard = await prisma.dashboard.findUnique({
    where: { shareToken: token },
    include: {
      widgets: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      project: { select: { id: true, name: true } },
    },
  });
  if (!dashboard || !dashboard.shareEnabled) {
    return NextResponse.json({ error: "찾을 수 없거나 공유가 비활성화됐어요" }, { status: 404 });
  }

  return NextResponse.json({
    dashboard: {
      id: dashboard.id,
      name: dashboard.name,
      description: dashboard.description,
      projectName: dashboard.project.name,
      widgets: dashboard.widgets,
    },
  });
}

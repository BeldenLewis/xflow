import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 공유 토큰으로 보드 정보 + 위젯 목록 반환 (인증 불필요)
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "잘못된 토큰" }, { status: 400 });
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

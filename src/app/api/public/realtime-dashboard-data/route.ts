import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { dashboardCache } from "@/lib/cache";
import { createHash } from "node:crypto";
import { verifySharePassword } from "@/lib/share-password";
import { generateDashboardReport } from "@/app/api/dashboard-report/route";

function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function tokenInvalid(token: string) {
  return !token || token.length < 32 || !/^[A-Za-z0-9_-]+$/.test(token);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { token, password } = body as { token?: string; password?: string };

  if (typeof token !== "string" || tokenInvalid(token)) {
    return NextResponse.json({ error: "토큰 형식 오류" }, { status: 401 });
  }

  const rl = rateLimit(`realtime-dashboard-data:${clientIp(request)}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "요청이 너무 잦아요" }, { status: 429 });
  }

  const project = await prisma.project.findUnique({
    where: { dashboardShareToken: token },
    select: {
      id: true,
      workspaceId: true,
      dashboardShareEnabled: true,
      dashboardSharePasswordHash: true,
      deletedAt: true,
    },
  });
  if (!project || !project.dashboardShareEnabled || project.deletedAt) {
    return NextResponse.json({ error: "공유가 비활성화됐어요" }, { status: 403 });
  }

  if (project.dashboardSharePasswordHash) {
    const cookieStore = await cookies();
    const verifiedCookie = cookieStore.get(`share_password_dashboard_${token}`)?.value;
    const passwordOk = verifiedCookie === "verified" ||
      (typeof password === "string" && verifySharePassword(password, project.dashboardSharePasswordHash));
    if (!passwordOk) {
      return NextResponse.json({ error: "비밀번호 필요", requiresPassword: true }, { status: 401 });
    }
  }

  // 고정: 최근 30일, 필터 없음 (공유 보기는 프로젝트 기본 스코프만 보여줌)
  const now = new Date();
  const fromD = new Date(now.getTime() - 30 * 86400_000);

  const cacheKey = "pub-realtime-dashboard:" + createHash("sha1")
    .update(JSON.stringify({ token, from: fromD.toISOString(), to: now.toISOString() }))
    .digest("hex");
  const cached = dashboardCache.get(cacheKey);
  if (cached) return NextResponse.json(cached);

  const result = await generateDashboardReport({
    workspaceId: project.workspaceId,
    projectId: project.id,
    from: fromD.toISOString(),
    to: now.toISOString(),
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  // 공유 응답에서는 내부 식별자를 제거 (project.id 등 노출 X)
  const data = result.data;
  // RealtimeReportData 모양을 유지하되 내부 id는 숨김 (빈 문자열)
  const payload = {
    ...data,
    project: { id: "", name: data.project.name },
  };

  dashboardCache.set(cacheKey, payload);
  return NextResponse.json(payload);
}

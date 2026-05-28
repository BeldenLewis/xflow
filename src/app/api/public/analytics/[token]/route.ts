import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { verifySharePassword } from "@/lib/share-password";

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

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (tokenInvalid(token)) {
    return NextResponse.json({ error: "잘못된 토큰" }, { status: 400 });
  }

  const rl = rateLimit(`analytics-share:${clientIp(request)}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦아요" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  const project = await prisma.project.findUnique({
    where: { analyticsShareToken: token },
    include: { workspace: { select: { name: true } } },
  });
  if (!project || !project.analyticsShareEnabled || project.deletedAt) {
    return NextResponse.json({ error: "찾을 수 없거나 공유가 비활성화됐어요" }, { status: 404 });
  }

  if (project.analyticsSharePasswordHash) {
    const cookieStore = await cookies();
    const verifiedCookie = cookieStore.get(`share_password_${token}`)?.value;
    if (verifiedCookie !== "verified") {
      return NextResponse.json({ requiresPassword: true }, { status: 401 });
    }
  }

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      workspaceName: project.workspace.name,
    },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (tokenInvalid(token)) {
    return NextResponse.json({ error: "잘못된 토큰" }, { status: 400 });
  }

  const rl = rateLimit(`analytics-share-pw:${clientIp(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦아요" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";

  const project = await prisma.project.findUnique({
    where: { analyticsShareToken: token },
    select: { id: true, analyticsShareEnabled: true, analyticsSharePasswordHash: true, deletedAt: true },
  });
  if (!project || !project.analyticsShareEnabled || project.deletedAt) {
    return NextResponse.json({ error: "찾을 수 없거나 공유가 비활성화됐어요" }, { status: 404 });
  }
  if (!project.analyticsSharePasswordHash) {
    return NextResponse.json({ ok: true, requiresPassword: false });
  }
  if (!verifySharePassword(password, project.analyticsSharePasswordHash)) {
    return NextResponse.json({ error: "비밀번호가 일치하지 않아요" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(`share_password_${token}`, "verified", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  });
  return response;
}

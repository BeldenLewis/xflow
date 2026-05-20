import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  const projectId = searchParams.get("projectId");

  if (!workspaceId) return NextResponse.json({ error: "workspaceId 필요" }, { status: 400 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const webinars = await prisma.webinar.findMany({
    where: { workspaceId, ...(projectId ? { projectId } : {}) },
    include: { _count: { select: { registrations: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ webinars });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json();
  const { workspaceId, projectId, name, slug, description, liveStartAt, liveEndAt, signupDeadline } = body;

  if (!workspaceId || !projectId || !name || !slug || !liveStartAt || !liveEndAt || !signupDeadline) {
    return NextResponse.json({ error: "필수 항목이 누락됐어요" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const existing = await prisma.webinar.findUnique({ where: { slug } });
  if (existing) return NextResponse.json({ error: "이미 사용 중인 슬러그예요" }, { status: 409 });

  const webinar = await prisma.webinar.create({
    data: {
      workspaceId,
      projectId,
      name,
      slug,
      description: description ?? null,
      liveStartAt: new Date(liveStartAt),
      liveEndAt: new Date(liveEndAt),
      signupDeadline: new Date(signupDeadline),
      theme: {
        accentColor: "#6d28d9",
        bgColor: "#0f0f0f",
        surfaceColor: "#1a1a1a",
        textColor: "#ffffff",
        font: "Pretendard",
      },
      config: {},
    },
  });

  return NextResponse.json({ webinar }, { status: 201 });
}

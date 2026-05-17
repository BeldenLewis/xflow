import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
  if (!membership) return NextResponse.json({ utmLinks: [] });

  const utmLinks = await prisma.uTMLink.findMany({
    where: {
      workspaceId: membership.workspaceId,
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json({ utmLinks });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json();
  const { name, url, utmSource, utmMedium, utmCampaign, utmTerm, utmContent, fullUrl, shortUrl, projectId } = body;

  let membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });

  if (membership?.role === "MEMBER") {
    return NextResponse.json({ error: "뷰어는 UTM을 생성할 수 없어요. 소유자에게 권한 변경을 요청하세요." }, { status: 403 });
  }

  if (!membership) {
    const dbUser = await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: { id: user.id, email: user.email!, name: user.user_metadata?.name ?? user.email },
    });
    const workspace = await prisma.workspace.create({
      data: { name: "내 워크스페이스", slug: `ws-${user.id.slice(0, 8)}` },
    });
    membership = await prisma.workspaceMember.create({
      data: { userId: dbUser.id, workspaceId: workspace.id, role: "OWNER" },
    });
  }

  const utmLink = await prisma.uTMLink.create({
    data: {
      name: name || null,
      url,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm: utmTerm || null,
      utmContent: utmContent || null,
      fullUrl,
      shortUrl: shortUrl || null,
      workspaceId: membership.workspaceId,
      projectId: projectId || null,
      createdById: user.id,
    },
  });

  return NextResponse.json({ utmLink });
}

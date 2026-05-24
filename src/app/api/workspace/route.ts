import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// 현재 워크스페이스 + 프로젝트 목록
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id, workspace: { deletedAt: null } },
    include: { workspace: { include: { projects: { orderBy: { createdAt: "asc" } } } } },
    orderBy: { joinedAt: "asc" },
  });

  if (memberships.length === 0) return NextResponse.json({ workspace: null, workspaces: [], projects: [] });

  const all = memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    role: m.role,
  }));

  return NextResponse.json({
    workspace: all[0],
    workspaces: all,
    projects: memberships[0].workspace.projects,
  });
}

// 새 워크스페이스 생성
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

    const { name } = await request.json();
    const slug = `${name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "ws"}-${Date.now()}`;

    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: { id: user.id, email: user.email!, name: user.user_metadata?.name ?? user.email },
    });

    const workspace = await prisma.workspace.create({ data: { name, slug } });

    await prisma.workspaceMember.create({
      data: { userId: user.id, workspaceId: workspace.id, role: "OWNER" },
    });

    return NextResponse.json({ workspace });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[워크스페이스 생성 오류]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

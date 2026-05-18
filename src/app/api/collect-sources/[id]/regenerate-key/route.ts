import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { randomBytes } from "node:crypto";

function newKey(): string {
  return randomBytes(24).toString("base64url");
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const source = await prisma.collectSource.findUnique({ where: { id } });
  if (!source) return NextResponse.json({ error: "소스를 찾을 수 없어요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: source.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });
  if (membership.role === "MEMBER") return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  // 충돌 회피 (현실적으로 일어나기 어렵지만)
  let apiKey = newKey();
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.collectSource.findUnique({ where: { apiKey }, select: { id: true } });
    if (!exists) break;
    apiKey = newKey();
  }

  const updated = await prisma.collectSource.update({
    where: { id },
    data: { apiKey },
  });

  await logActivity({
    workspaceId: source.workspaceId,
    sourceId: source.id,
    userId: user.id,
    action: "source.key_regenerated",
    meta: { name: source.name },
  });

  return NextResponse.json({ apiKey: updated.apiKey });
}

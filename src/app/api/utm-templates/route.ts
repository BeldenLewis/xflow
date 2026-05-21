import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function getWorkspaceId(workspaceId: string | null, userId: string) {
  if (workspaceId) return workspaceId;
  const m = await prisma.workspaceMember.findFirst({ where: { userId }, orderBy: { joinedAt: "asc" } });
  return m?.workspaceId ?? null;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const wsId = await getWorkspaceId(searchParams.get("workspaceId"), user.id);
  if (!wsId) return NextResponse.json({ templates: [] });

  const templates = await prisma.uTMTemplate.findMany({
    where: { workspaceId: wsId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { workspaceId, name, source, medium, campaign, term, content } = await request.json();
  const nameValue = typeof name === "string" ? name.trim() : "";
  const sourceValue = typeof source === "string" ? source.trim().toLowerCase() : "";
  const mediumValue = typeof medium === "string" ? medium.trim().toLowerCase() : "";
  const campaignValue = typeof campaign === "string" ? campaign.trim() : "";

  if (!nameValue || !sourceValue || !mediumValue || !campaignValue) {
    return NextResponse.json({ error: "name, source, medium, campaign은 필수입니다" }, { status: 400 });
  }

  const wsId = await getWorkspaceId(workspaceId, user.id);
  if (!wsId) return NextResponse.json({ error: "워크스페이스 없음" }, { status: 400 });

  const template = await prisma.uTMTemplate.create({
    data: {
      id: crypto.randomUUID(),
      workspaceId: wsId,
      name: nameValue,
      source: sourceValue,
      medium: mediumValue,
      campaign: campaignValue,
      term: term?.trim() || null,
      content: content?.trim() || null,
    },
  });

  return NextResponse.json({ template });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await request.json();
  await prisma.uTMTemplate.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

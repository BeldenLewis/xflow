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
  if (!wsId) return NextResponse.json({ presets: [] });

  const presets = await prisma.uTMPreset.findMany({
    where: { workspaceId: wsId },
    orderBy: [{ field: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ presets });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { workspaceId, field, value, label } = await request.json();
  if (!field || !value) return NextResponse.json({ error: "field와 value는 필수입니다" }, { status: 400 });

  const wsId = await getWorkspaceId(workspaceId, user.id);
  if (!wsId) return NextResponse.json({ error: "워크스페이스 없음" }, { status: 400 });

  const trimmedValue = value.trim().toLowerCase();
  const trimmedLabel = label?.trim() || null;

  const existing = await prisma.uTMPreset.findFirst({
    where: { workspaceId: wsId, field, value: trimmedValue },
  });

  if (existing) {
    const updated = await prisma.uTMPreset.update({
      where: { id: existing.id },
      data: { label: trimmedLabel },
    });
    return NextResponse.json({ preset: updated });
  }

  // 새 항목은 현재 필드의 마지막 순서로 추가
  const last = await prisma.uTMPreset.findFirst({
    where: { workspaceId: wsId, field },
    orderBy: { sortOrder: "desc" },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const preset = await prisma.uTMPreset.create({
    data: { id: crypto.randomUUID(), workspaceId: wsId, field, value: trimmedValue, label: trimmedLabel, sortOrder },
  });

  return NextResponse.json({ preset });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json();

  // 순서 일괄 변경: { orders: [{ id, sortOrder }] }
  if (body.orders) {
    await Promise.all(
      (body.orders as { id: string; sortOrder: number }[]).map(({ id, sortOrder }) =>
        prisma.uTMPreset.update({ where: { id }, data: { sortOrder } })
      )
    );
    return NextResponse.json({ ok: true });
  }

  // 단일 수정: { id, value?, label? }
  const { id, value, label } = body;
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

  try {
    const updated = await prisma.uTMPreset.update({
      where: { id },
      data: {
        ...(value !== undefined && { value: value.trim().toLowerCase() }),
        label: label?.trim() || null,
      },
    });
    return NextResponse.json({ preset: updated });
  } catch {
    return NextResponse.json({ error: "이미 존재하는 값이에요" }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await request.json();
  await prisma.uTMPreset.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

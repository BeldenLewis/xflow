import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { name, description } = await request.json();

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
  });
  if (!membership) return NextResponse.json({ error: "워크스페이스 없음" }, { status: 400 });

  const project = await prisma.project.create({
    data: { name, description: description || null, workspaceId: membership.workspaceId },
  });

  return NextResponse.json({ project });
}

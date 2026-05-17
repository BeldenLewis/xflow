import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { workspaceName, slug, userId, email, name } = await request.json();

    const user = await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email, name: name ?? email },
    });

    const workspace = await prisma.workspace.create({
      data: { name: workspaceName, slug: `${slug}-${Date.now()}` },
    });

    await prisma.workspaceMember.create({
      data: { userId: user.id, workspaceId: workspace.id, role: "OWNER" },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "워크스페이스 생성 실패" }, { status: 500 });
  }
}

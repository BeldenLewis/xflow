import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Soft-deleted 30일 지난 레코드 영구 제거.
// Vercel cron 또는 외부 호출. CRON_SECRET 으로 보호.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 30 * 86400_000);
  const [sources, projects, workspaces] = await Promise.all([
    prisma.collectSource.deleteMany({ where: { deletedAt: { lt: cutoff } } }),
    prisma.project.deleteMany({ where: { deletedAt: { lt: cutoff } } }),
    prisma.workspace.deleteMany({ where: { deletedAt: { lt: cutoff } } }),
  ]);

  return NextResponse.json({
    purged: { sources: sources.count, projects: projects.count, workspaces: workspaces.count },
    cutoff: cutoff.toISOString(),
  });
}

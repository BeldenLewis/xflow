import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 매일 한 번 호출 — CollectRetentionPolicy 정책에 따라 N일 지난 레코드 삭제.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const policies = await prisma.collectRetentionPolicy.findMany();
  const results: { sourceId: string; deleted: number }[] = [];

  for (const p of policies) {
    if (p.retainDays <= 0) continue;
    const cutoff = new Date(Date.now() - p.retainDays * 86400_000);
    const r = await prisma.collectRecord.deleteMany({
      where: { sourceId: p.sourceId, createdAt: { lt: cutoff } },
    });
    results.push({ sourceId: p.sourceId, deleted: r.count });
  }

  return NextResponse.json({ count: results.length, results });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cronMatchesKst, nextRunFromNow } from "@/lib/cron";
import { formatKstDateTime, kstDateString } from "@/lib/datetime";

// Vercel Cron 또는 외부 호출자가 매 분 호출.
// 보호: CRON_SECRET 환경변수 일치하는 경우만 실행.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // 활성 + nextRunAt 가 지났거나 비어있는 리포트
  const due = await prisma.scheduledReport.findMany({
    where: {
      isActive: true,
      OR: [
        { nextRunAt: null },
        { nextRunAt: { lte: now } },
      ],
    },
    include: { dashboard: { include: { project: { select: { name: true } }, widgets: true } } },
  });

  // 보강: cronMatchesKst 로 한번 더 검증 (방어)
  const fired: { id: string; name: string; ok: boolean; error?: string }[] = [];
  for (const r of due) {
    if (!cronMatchesKst(r.cron, now)) {
      // nextRunAt 갱신만
      await prisma.scheduledReport.update({
        where: { id: r.id },
        data: { nextRunAt: nextRunFromNow(r.cron, now) },
      });
      continue;
    }

    try {
      await sendReport(r);
      await prisma.scheduledReport.update({
        where: { id: r.id },
        data: { lastRunAt: now, nextRunAt: nextRunFromNow(r.cron, new Date(now.getTime() + 60_000)) },
      });
      fired.push({ id: r.id, name: r.name, ok: true });
    } catch (e) {
      fired.push({ id: r.id, name: r.name, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ count: fired.length, fired });
}

interface ReportWithDashboard {
  id: string;
  name: string;
  cron: string;
  channel: string;
  target: string;
  dashboard: {
    id: string;
    name: string;
    projectId: string;
    project: { name: string };
    widgets: { type: string; title: string; config: unknown }[];
  };
}

async function sendReport(report: ReportWithDashboard) {
  // 핵심 KPI 위젯 데이터를 직접 집계해서 요약 메시지 만듦
  const dash = report.dashboard;
  const now = new Date();
  // 기본 기간: 지난 7일
  const from = new Date(now.getTime() - 7 * 86400_000);

  const totalCount = await prisma.collectRecord.count({
    where: { projectId: dash.projectId, createdAt: { gte: from, lte: now } },
  });
  const prevFrom = new Date(from.getTime() - 7 * 86400_000);
  const prevCount = await prisma.collectRecord.count({
    where: { projectId: dash.projectId, createdAt: { gte: prevFrom, lt: from } },
  });
  const change = prevCount > 0 ? (((totalCount - prevCount) / prevCount) * 100).toFixed(1) : null;

  // 상위 UTM 소스 5
  const records = await prisma.collectRecord.findMany({
    where: { projectId: dash.projectId, createdAt: { gte: from, lte: now } },
    select: { utmSource: true },
  });
  const utmCounts = new Map<string, number>();
  for (const r of records) {
    const v = (r.utmSource ?? "(direct)").trim() || "(direct)";
    utmCounts.set(v, (utmCounts.get(v) ?? 0) + 1);
  }
  const top = Array.from(utmCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const summary = [
    `📊 *${dash.project.name}* — ${report.name}`,
    `_${kstDateString(from)} ~ ${kstDateString(now)} (KST)_`,
    "",
    `*총 제출*: ${totalCount.toLocaleString()}건${change !== null ? ` (지난 주 대비 ${change}%)` : ""}`,
    "",
    "*상위 UTM 소스*",
    ...top.map(([k, v], i) => `${i + 1}. ${k}: ${v.toLocaleString()}건`),
    "",
    `발송: ${formatKstDateTime(now)} KST`,
  ].join("\n");

  if (report.channel === "slack") {
    const res = await fetch(report.target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: summary }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Slack ${res.status}`);
  } else if (report.channel === "email") {
    // TODO: 이메일 발송 (Resend 등). 현재는 로깅만.
    console.log("[scheduled-report] email send (placeholder):", report.target, summary);
  }
}

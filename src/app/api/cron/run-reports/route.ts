import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cronMatchesKst, nextRunFromNow } from "@/lib/cron";
import { formatKstDateTime, kstDateString } from "@/lib/datetime";
import { isSafePublicUrl } from "@/lib/url-safety";
import { logActivity } from "@/lib/activity";

interface ReportRow {
  id: string;
  name: string;
  channel: string;
  target: string;
  workspaceId: string;
}

async function logDelivery(report: ReportRow, ok: boolean, error?: string) {
  await logActivity({
    workspaceId: report.workspaceId,
    action: ok ? "scheduledReport.delivered" : "scheduledReport.delivery_failed",
    meta: ok
      ? { reportId: report.id, channel: report.channel, name: report.name }
      : { reportId: report.id, channel: report.channel, name: report.name, error: error ?? "unknown" },
  });
}

// Vercel Cron 또는 외부 호출자가 매 분 호출.
// 보호: CRON_SECRET 환경변수 일치하는 경우만 실행.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      await logDelivery(
        { id: r.id, name: r.name, channel: r.channel, target: r.target, workspaceId: r.workspaceId },
        true,
      );
      fired.push({ id: r.id, name: r.name, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logDelivery(
        { id: r.id, name: r.name, channel: r.channel, target: r.target, workspaceId: r.workspaceId },
        false,
        msg,
      );
      fired.push({ id: r.id, name: r.name, ok: false, error: msg });
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
    // SSRF 방어: Slack webhook 호스트 제한 + 사설 IP 차단.
    const safe = isSafePublicUrl(report.target);
    if (!safe.ok || !safe.url) {
      throw new Error(`Slack webhook URL 차단됨: ${safe.reason ?? "invalid"}`);
    }
    if (safe.url.hostname !== "hooks.slack.com") {
      throw new Error(`Slack webhook 호스트가 아니에요: ${safe.url.hostname}`);
    }

    // Slack blocks 포맷 — 텍스트 fallback 도 함께 전송.
    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: `📊 ${dash.project.name} — ${report.name}` },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `기간: ${kstDateString(from)} ~ ${kstDateString(now)} (KST)` },
        ],
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*총 제출*\n${totalCount.toLocaleString()}건${change !== null ? ` (${change}%)` : ""}` },
          { type: "mrkdwn", text: `*지난 주*\n${prevCount.toLocaleString()}건` },
        ],
      },
      ...(top.length
        ? [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*상위 UTM 소스*\n${top.map(([k, v], i) => `${i + 1}. ${k}: ${v.toLocaleString()}건`).join("\n")}`,
              },
            },
          ]
        : []),
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `발송: ${formatKstDateTime(now)} KST` }],
      },
    ];

    const res = await fetch(safe.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: summary, blocks }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Slack ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }
  } else if (report.channel === "email") {
    // 이메일 발송은 별도 구현 예정 (Resend 등 외부 공급자 통합 필요).
    // 현재는 미구현으로 명시적 에러 던져 ActivityLog 에 기록.
    throw new Error("email channel 미구현");
  } else {
    throw new Error(`알 수 없는 channel: ${report.channel}`);
  }
}

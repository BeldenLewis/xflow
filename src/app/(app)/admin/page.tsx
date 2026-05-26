import type { ElementType, ReactNode } from "react";
import {
  Activity,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Clock3,
  Database,
  FolderKanban,
  Gauge,
  KeyRound,
  Layers,
  PauseCircle,
  PlayCircle,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { formatKstDateTime } from "@/lib/datetime";
import { isSuperAdminEmail, SUPER_ADMIN_EMAIL } from "@/lib/super-admin";
import {
  deleteUserAction,
  renameProjectAction,
  renameWorkspaceAction,
  setCollectSourceActiveAction,
  setProjectArchivedAction,
  setWorkspaceArchivedAction,
} from "./actions";

export const dynamic = "force-dynamic";

type AdminView = "overview" | "system" | "users" | "workspaces" | "projects" | "activity";

type AdminSearchParams = Promise<{
  q?: string | string[];
  view?: string | string[];
  message?: string | string[];
}>;

const adminViews: Array<{
  id: AdminView;
  icon: ElementType;
  label: string;
  desc: string;
}> = [
  { id: "overview", icon: Gauge, label: "개요", desc: "오늘 먼저 볼 것" },
  { id: "system", icon: Server, label: "시스템", desc: "상태와 환경" },
  { id: "users", icon: Users, label: "사용자", desc: "가입과 삭제" },
  { id: "workspaces", icon: Layers, label: "워크스페이스", desc: "고객 단위" },
  { id: "projects", icon: Database, label: "프로젝트/데이터", desc: "수집 흐름" },
  { id: "activity", icon: Activity, label: "활동 로그", desc: "감사 이력" },
];

const ACTIVITY_LABELS: Record<string, string> = {
  "source.created": "사전등록 폼 생성",
  "source.updated": "사전등록 폼 설정 변경",
  "source.deleted": "사전등록 폼 삭제",
  "source.key_regenerated": "API 키 재발급",
  "record.created": "레코드 생성",
  "record.updated": "레코드 수정",
  "record.deleted": "레코드 삭제",
  "records.bulk_deleted": "레코드 대량 삭제",
  "records.imported": "레코드 가져오기",
  "records.cleaned": "데이터 정리",
  "records.normalized": "데이터 정규화",
  "records.exported": "레코드 내보내기",
  "collect.records.exported": "사전등록 내보내기",
  "workspace.member.invited": "팀원 초대",
  "workspace.member.role_changed": "팀원 권한 변경",
  "workspace.member.removed": "팀원 제거",
  "apiToken.created": "API 토큰 발급",
  "apiToken.revoked": "API 토큰 회수",
  "dashboardShareToken.rotated": "대시보드 공유 토큰 회전",
  "webinar.registrations.exported": "웨비나 등록자 내보내기",
  "scheduledReport.delivered": "리포트 발송 성공",
  "scheduledReport.delivery_failed": "리포트 발송 실패",
  "admin.workspace_renamed": "관리자 — 워크스페이스 이름 변경",
  "admin.workspace_archived": "관리자 — 워크스페이스 보관",
  "admin.workspace_restored": "관리자 — 워크스페이스 복구",
  "admin.project_updated": "관리자 — 프로젝트 변경",
  "admin.project_archived": "관리자 — 프로젝트 보관",
  "admin.project_restored": "관리자 — 프로젝트 복구",
  "admin.source_activated": "관리자 — 소스 활성화",
  "admin.source_paused": "관리자 — 소스 일시중지",
  "admin.user_deleted": "관리자 — 사용자 삭제",
};

function adminActivityLabel(action: string): string {
  return ACTIVITY_LABELS[action] ?? action;
}

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizeView(value: string): AdminView {
  return adminViews.some((view) => view.id === value) ? value as AdminView : "overview";
}

function hrefFor(view: AdminView) {
  return view === "overview" ? "/admin" : `/admin?view=${view}`;
}

function SectionHeader({
  index,
  title,
  desc,
  meta,
}: {
  index: string;
  title: string;
  desc: string;
  meta?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{index}</p>
        <h2 className="mt-2 text-xl font-semibold">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{desc}</p>
      </div>
      {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
    </div>
  );
}

function StatChip({
  icon: Icon,
  label,
  value,
}: {
  icon: ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:bg-secondary/40">
      <Icon className="size-4 shrink-0 text-violet-500" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function PriorityCard({
  icon: Icon,
  label,
  title,
  desc,
  href,
}: {
  icon: ElementType;
  label: string;
  title: string;
  desc: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group rounded-lg border border-border bg-background p-4 transition duration-150 hover:-translate-y-0.5 hover:border-violet-400/60 hover:bg-secondary/40"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
          <Icon className="size-4" />
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      </div>
      <h3 className="mt-5 text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{desc}</p>
      <p className="mt-4 text-xs font-medium text-violet-500 group-hover:underline">확인하기</p>
    </a>
  );
}

function AdminMenu({
  currentView,
}: {
  currentView: AdminView;
}) {
  return (
    <nav className="space-y-1">
      {adminViews.map((item) => {
        const Icon = item.icon;
        const active = item.id === currentView;
        return (
          <a
            key={item.id}
            href={hrefFor(item.id)}
            className={`group flex items-start gap-3 rounded-lg px-3 py-3 transition duration-150 hover:-translate-y-0.5 ${
              active
                ? "bg-violet-500/10 text-violet-500"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <Icon className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{item.label}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{item.desc}</span>
            </span>
          </a>
        );
      })}
    </nav>
  );
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  const toneClass = {
    neutral: "bg-secondary text-muted-foreground",
    good: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warn: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    danger: "bg-red-500/10 text-red-600 dark:text-red-400",
  }[tone];

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${toneClass}`}>
      {children}
    </span>
  );
}

function SubmitButton({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "danger" | "good";
}) {
  const toneClass = {
    neutral: "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
    danger: "border-red-500/30 text-red-600 hover:bg-red-500/10 dark:text-red-400",
    good: "border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400",
  }[tone];

  return (
    <button
      type="submit"
      className={`inline-flex h-8 items-center justify-center rounded-lg border px-3 text-xs font-medium transition duration-150 hover:-translate-y-0.5 active:translate-y-0 ${toneClass}`}
    >
      {children}
    </button>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return <p className="border-t border-border py-8 text-center text-xs text-muted-foreground">{children}</p>;
}

function ManagementDetails({ children }: { children: ReactNode }) {
  return (
    <details className="group mt-3">
      <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition duration-150 hover:-translate-y-0.5 hover:bg-secondary hover:text-foreground">
        관리 열기
      </summary>
      <div className="mt-3 rounded-lg bg-secondary/40 p-3">{children}</div>
    </details>
  );
}

function SystemLine({
  label,
  value,
  ok,
  meta,
}: {
  label: string;
  value: string;
  ok: boolean;
  meta: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-4 border-t border-border py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{meta}</p>
      </div>
      <div className="flex items-center gap-2">
        <StatusPill tone={ok ? "good" : "danger"}>{ok ? "정상" : "확인 필요"}</StatusPill>
        <span className="font-mono text-xs text-muted-foreground">{value}</span>
      </div>
    </div>
  );
}

async function getDbHealth() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - startedAt, error: "" };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export default async function SuperAdminPage({ searchParams }: { searchParams?: AdminSearchParams }) {
  const params = searchParams ? await searchParams : {};
  const query = firstParam(params.q).trim();
  const currentView = normalizeView(firstParam(params.view));
  const message = firstParam(params.message).trim();
  const selectedView = adminViews.find((view) => view.id === currentView) ?? adminViews[0];

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!isSuperAdminEmail(user?.email)) notFound();

  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const userWhere = query ? { OR: [{ email: { contains: query } }, { name: { contains: query } }] } : {};
  const workspaceWhere = query ? { OR: [{ name: { contains: query } }, { slug: { contains: query } }] } : {};
  const projectWhere = query ? { OR: [{ name: { contains: query } }, { description: { contains: query } }] } : {};
  const sourceWhere = query ? { OR: [{ name: { contains: query } }, { siteUrl: { contains: query } }, { apiKey: { contains: query } }] } : {};

  const [
    userCount,
    workspaceCount,
    archivedWorkspaceCount,
    projectCount,
    archivedProjectCount,
    collectSourceCount,
    collectRecordCount,
    recordsLast24h,
    dashboardCount,
    webinarCount,
    apiTokenCount,
    pendingInvitationCount,
    dueReportCount,
    inactiveSourceCount,
    webhookSourceCount,
    dbHealth,
    newUserCount,
    adminUsers,
    workspaces,
    projects,
    collectSources,
    recentActivities,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.workspace.count({ where: { deletedAt: null } }),
    prisma.workspace.count({ where: { deletedAt: { not: null } } }),
    prisma.project.count({ where: { deletedAt: null } }),
    prisma.project.count({ where: { deletedAt: { not: null } } }),
    prisma.collectSource.count({ where: { deletedAt: null } }),
    prisma.collectRecord.count(),
    prisma.collectRecord.count({ where: { createdAt: { gte: since24h } } }),
    prisma.dashboard.count(),
    prisma.webinar.count(),
    prisma.apiToken.count(),
    prisma.workspaceInvitation.count({ where: { status: "PENDING" } }),
    prisma.scheduledReport.count({ where: { isActive: true, nextRunAt: { lte: now } } }),
    prisma.collectSource.count({ where: { deletedAt: null, isActive: false } }),
    prisma.collectSource.count({ where: { deletedAt: null, webhookUrl: { not: null } } }),
    getDbHealth(),
    prisma.user.count({ where: { createdAt: { gte: since7d } } }),
    prisma.user.findMany({
      where: userWhere,
      orderBy: { createdAt: "desc" },
      take: 7,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        memberships: {
          orderBy: { joinedAt: "asc" },
          take: 5,
          select: {
            role: true,
            joinedAt: true,
            workspace: {
              select: {
                id: true,
                name: true,
                slug: true,
                createdAt: true,
                deletedAt: true,
                _count: { select: { members: true, projects: true } },
              },
            },
          },
        },
        activityLogs: {
          orderBy: { createdAt: "desc" },
          take: 15,
          select: {
            id: true,
            action: true,
            createdAt: true,
            meta: true,
            workspace: { select: { name: true, slug: true } },
            source: { select: { name: true } },
          },
        },
        _count: {
          select: {
            memberships: true,
            apiTokens: true,
            projectMemberships: true,
            activityLogs: true,
            sentInvitations: true,
            receivedInvitations: true,
            utmLinks: true,
            shortLinks: true,
          },
        },
      },
    }),
    prisma.workspace.findMany({
      where: workspaceWhere,
      orderBy: { updatedAt: "desc" },
      take: 7,
      select: {
        id: true,
        name: true,
        slug: true,
        deletedAt: true,
        members: {
          where: { role: "OWNER" },
          take: 2,
          select: { user: { select: { email: true, name: true } } },
        },
        _count: {
          select: {
            members: true,
            projects: true,
            collectRecords: true,
            webinars: true,
          },
        },
      },
    }),
    prisma.project.findMany({
      where: projectWhere,
      orderBy: { updatedAt: "desc" },
      take: 7,
      select: {
        id: true,
        name: true,
        description: true,
        deletedAt: true,
        workspace: { select: { name: true, deletedAt: true } },
        _count: {
          select: {
            collectSources: true,
            collectRecords: true,
            dashboards: true,
            webinars: true,
          },
        },
      },
    }),
    prisma.collectSource.findMany({
      where: sourceWhere,
      orderBy: { updatedAt: "desc" },
      take: 7,
      select: {
        id: true,
        name: true,
        apiKey: true,
        siteUrl: true,
        isActive: true,
        deletedAt: true,
        notifyOnSubmit: true,
        webhookUrl: true,
        workspace: { select: { name: true } },
        project: { select: { name: true } },
        _count: { select: { records: true, fieldMappings: true } },
      },
    }),
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        action: true,
        createdAt: true,
        workspace: { select: { name: true } },
        user: { select: { email: true, name: true } },
      },
    }),
  ]);

  const envChecks = [
    { key: "DATABASE_URL", ok: Boolean(process.env.DATABASE_URL), meta: "Prisma/Postgres 연결" },
    { key: "NEXT_PUBLIC_SUPABASE_URL", ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), meta: "Supabase Auth URL" },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), meta: "Auth 클라이언트 키" },
    { key: "NEXT_PUBLIC_APP_URL", ok: Boolean(process.env.NEXT_PUBLIC_APP_URL), meta: "초대/임베드 기준 URL" },
    { key: "CRON_SECRET", ok: Boolean(process.env.CRON_SECRET), meta: "정기 작업 보호 키" },
  ];

  const attentionCount = Number(!dbHealth.ok) + dueReportCount + inactiveSourceCount + pendingInvitationCount;
  const showSearch = currentView === "users" || currentView === "workspaces" || currentView === "projects";
  const searchPlaceholder = currentView === "users"
    ? "이름 또는 이메일"
    : currentView === "workspaces"
      ? "워크스페이스 이름 또는 slug"
      : "프로젝트, 수집 소스, API 키";

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <header className="border-b border-border pb-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
                  <ShieldCheck className="size-4" />
                </span>
                <p className="text-xs font-medium text-muted-foreground">Super Admin</p>
              </div>
              <h1 className="mt-5 text-3xl font-semibold tracking-normal">관리 업무를 메뉴별로 나눠서 봅니다.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                {SUPER_ADMIN_EMAIL} 전용 관리자 화면입니다. 전체 스크롤 대신 왼쪽 메뉴에서 필요한 업무만 열어보세요.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
              로그인 <span className="ml-2 font-mono text-foreground">{user?.email}</span>
            </div>
          </div>

          {message && (
            <div className="mt-5 flex max-w-2xl items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-4" />
              {message}
            </div>
          )}
        </header>

        <section className="py-6">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
            <StatChip icon={Users} label="사용자" value={`${userCount.toLocaleString()}명`} />
            <StatChip icon={Layers} label="워크스페이스" value={workspaceCount.toLocaleString()} />
            <StatChip icon={FolderKanban} label="프로젝트" value={projectCount.toLocaleString()} />
            <StatChip icon={Database} label="레코드" value={collectRecordCount.toLocaleString()} />
            <StatChip icon={Video} label="웨비나/보드" value={`${webinarCount.toLocaleString()} / ${dashboardCount.toLocaleString()}`} />
            <StatChip icon={KeyRound} label="API 토큰" value={apiTokenCount.toLocaleString()} />
            <StatChip icon={Gauge} label="DB" value={dbHealth.ok ? `${dbHealth.latencyMs}ms` : "장애"} />
            <StatChip icon={Clock3} label="확인 필요" value={attentionCount.toLocaleString()} />
          </div>
        </section>

        <div className="grid gap-8 border-t border-border pt-7 lg:grid-cols-[240px_1fr]">
          <aside>
            <div className="sticky top-6">
              <p className="mb-3 text-xs font-semibold text-muted-foreground">관리 메뉴</p>
              <AdminMenu currentView={currentView} />
            </div>
          </aside>

          <main className="min-w-0">
            <SectionHeader
              index={currentView === "overview" ? "Start Here" : selectedView.label}
              title={selectedView.label}
              desc={selectedView.desc}
            />

            {showSearch && (
              <form className="mt-5 flex flex-col gap-2 sm:flex-row" action="/admin">
                <input type="hidden" name="view" value={currentView} />
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    name="q"
                    defaultValue={query}
                    placeholder={searchPlaceholder}
                    className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors focus:border-violet-400"
                  />
                </div>
                <button className="h-10 rounded-lg bg-violet-500 px-4 text-sm font-medium text-white transition duration-150 hover:-translate-y-0.5 hover:bg-violet-600 active:translate-y-0">
                  검색
                </button>
              </form>
            )}

            {currentView === "overview" && (
              <section className="mt-5">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <PriorityCard
                    icon={Gauge}
                    label={dbHealth.ok ? "정상" : "주의"}
                    title="시스템 상태"
                    desc={`DB ${dbHealth.latencyMs}ms, 실행 지연 리포트 ${dueReportCount.toLocaleString()}건입니다.`}
                    href={hrefFor("system")}
                  />
                  <PriorityCard
                    icon={Users}
                    label={`7일 ${newUserCount.toLocaleString()}명`}
                    title="사용자 관리"
                    desc="가입일, 소속 워크스페이스, 활동, 토큰, 삭제 가능 여부를 확인합니다."
                    href={hrefFor("users")}
                  />
                  <PriorityCard
                    icon={Layers}
                    label={`${pendingInvitationCount.toLocaleString()}건 대기`}
                    title="고객/워크스페이스"
                    desc={`운영 ${workspaceCount.toLocaleString()}개, 보관 ${archivedWorkspaceCount.toLocaleString()}개를 확인합니다.`}
                    href={hrefFor("workspaces")}
                  />
                  <PriorityCard
                    icon={Database}
                    label={`24h ${recordsLast24h.toLocaleString()}건`}
                    title="프로젝트/데이터"
                    desc={`프로젝트 ${projectCount.toLocaleString()}개, 보관 ${archivedProjectCount.toLocaleString()}개, 수집 소스 ${collectSourceCount.toLocaleString()}개를 점검합니다.`}
                    href={hrefFor("projects")}
                  />
                </div>
              </section>
            )}

            {currentView === "system" && (
              <section className="mt-5 grid grid-cols-1 gap-x-8 lg:grid-cols-2">
                <div>
                  <SystemLine label="Database" value={`${dbHealth.latencyMs}ms`} ok={dbHealth.ok} meta={dbHealth.error || "SELECT 1 응답 기준"} />
                  {envChecks.map((check) => (
                    <SystemLine key={check.key} label={check.key} value={check.ok ? "set" : "missing"} ok={check.ok} meta={check.meta} />
                  ))}
                </div>
                <div className="mt-6 lg:mt-0">
                  <div className="border-t border-border py-3">
                    <div className="flex items-center gap-2">
                      <Server className="size-4 text-violet-500" />
                      <h3 className="text-sm font-semibold">운영 신호</h3>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      비활성 수집 소스 {inactiveSourceCount.toLocaleString()}개, 웹훅 연결 소스 {webhookSourceCount.toLocaleString()}개,
                      최근 24시간 수집 레코드 {recordsLast24h.toLocaleString()}건입니다.
                    </p>
                  </div>
                  <div className="border-t border-border py-3">
                    <h3 className="text-sm font-semibold">Cron</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      일일 작업, 리포트 발송, 보관 정책, soft delete 정리가 `CRON_SECRET`으로 보호됩니다.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {currentView === "users" && (
              <section className="mt-5">
                {adminUsers.length === 0 ? (
                  <EmptyText>검색 조건에 맞는 사용자가 없습니다.</EmptyText>
                ) : (
                  adminUsers.map((adminUser) => {
                    const ownerMemberships = adminUser.memberships.filter((membership) => membership.role === "OWNER");
                    const activeOwnerMemberships = ownerMemberships.filter((membership) => !membership.workspace.deletedAt);
                    const firstOwnedWorkspace = ownerMemberships[0]?.workspace;
                    const canDelete = !isSuperAdminEmail(adminUser.email) && activeOwnerMemberships.length === 0;

                    return (
                      <article key={adminUser.id} className="border-t border-border py-4">
                        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-sm font-semibold">{adminUser.name || "이름 없음"}</h3>
                              <StatusPill tone={isSuperAdminEmail(adminUser.email) ? "warn" : "neutral"}>
                                {isSuperAdminEmail(adminUser.email) ? "슈퍼어드민" : "사용자"}
                              </StatusPill>
                              {activeOwnerMemberships.length > 0 && <StatusPill tone="warn">소유자</StatusPill>}
                            </div>
                            <p className="mt-1 truncate text-xs text-muted-foreground">{adminUser.email}</p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              가입 {formatKstDateTime(adminUser.createdAt)}
                              {firstOwnedWorkspace && ` · 첫 소유 워크스페이스 ${firstOwnedWorkspace.name} (${formatKstDateTime(firstOwnedWorkspace.createdAt).slice(0, 10)})`}
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs text-muted-foreground lg:text-right">
                            <span>워크스페이스 {adminUser._count.memberships}</span>
                            <span>프로젝트 권한 {adminUser._count.projectMemberships}</span>
                            <span>토큰 {adminUser._count.apiTokens}</span>
                            <span>활동 {adminUser._count.activityLogs}</span>
                          </div>
                        </div>

                        <ManagementDetails>
                          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
                            <div className="space-y-4">
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground">소속과 생성 맥락</h4>
                                <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-background">
                                  {adminUser.memberships.length === 0 ? (
                                    <p className="px-3 py-3 text-xs text-muted-foreground">연결된 워크스페이스가 없습니다.</p>
                                  ) : (
                                    adminUser.memberships.map((membership) => (
                                      <div key={`${adminUser.id}-${membership.workspace.id}`} className="grid gap-2 px-3 py-3 sm:grid-cols-[1fr_auto]">
                                        <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <p className="truncate text-xs font-medium">{membership.workspace.name}</p>
                                            <StatusPill tone={membership.workspace.deletedAt ? "warn" : "neutral"}>
                                              {membership.workspace.deletedAt ? "보관됨" : membership.role}
                                            </StatusPill>
                                          </div>
                                          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{membership.workspace.slug}</p>
                                        </div>
                                        <div className="text-[11px] text-muted-foreground sm:text-right">
                                          <p>가입 {formatKstDateTime(membership.joinedAt).slice(0, 10)}</p>
                                          <p>생성 {formatKstDateTime(membership.workspace.createdAt).slice(0, 10)}</p>
                                          <p>멤버 {membership.workspace._count.members} · 프로젝트 {membership.workspace._count.projects}</p>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>

                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground">
                                  최근 활동 히스토리
                                  <span className="ml-2 font-normal text-muted-foreground/70">
                                    최근 {adminUser.activityLogs.length}건 (총 {adminUser._count.activityLogs.toLocaleString()}건)
                                  </span>
                                </h4>
                                <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-background max-h-72 overflow-y-auto">
                                  {adminUser.activityLogs.length === 0 ? (
                                    <p className="px-3 py-3 text-xs text-muted-foreground">활동 기록이 없습니다.</p>
                                  ) : (
                                    adminUser.activityLogs.map((log) => (
                                      <div key={log.id} className="grid gap-1 px-3 py-2 sm:grid-cols-[1fr_auto] sm:items-center">
                                        <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="font-mono text-[11px] text-foreground">{adminActivityLabel(log.action)}</span>
                                            {log.source?.name && (
                                              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{log.source.name}</span>
                                            )}
                                          </div>
                                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                            {log.workspace?.name ?? "—"} · <span className="font-mono">{log.action}</span>
                                          </p>
                                        </div>
                                        <span className="text-[11px] text-muted-foreground sm:text-right">
                                          {formatKstDateTime(log.createdAt)}
                                        </span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="text-xs font-semibold text-muted-foreground">삭제 전 확인</h4>
                              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                앱 데이터 + Supabase Auth 계정이 함께 삭제됩니다. 되돌릴 수 없습니다.
                              </p>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                <span>UTM {adminUser._count.utmLinks}</span>
                                <span>숏링크 {adminUser._count.shortLinks}</span>
                                <span>보낸 초대 {adminUser._count.sentInvitations}</span>
                                <span>받은 초대 {adminUser._count.receivedInvitations}</span>
                              </div>
                              {!canDelete ? (
                                <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                                  {isSuperAdminEmail(adminUser.email)
                                    ? "슈퍼어드민 계정은 삭제할 수 없습니다."
                                    : "활성 워크스페이스 소유자입니다. 소유권 이전 또는 보관 후 삭제할 수 있습니다."}
                                </div>
                              ) : (
                                <form action={deleteUserAction} className="mt-3 space-y-2">
                                  <input type="hidden" name="userId" value={adminUser.id} />
                                  <input name="confirmEmail" required placeholder="삭제 확인 이메일" aria-label="삭제 확인 이메일" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-violet-400" />
                                  <input name="reason" required placeholder="삭제 사유" aria-label="사용자 삭제 사유" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-violet-400" />
                                  <SubmitButton tone="danger">
                                    <Trash2 className="mr-1 size-3.5" />
                                    회원 삭제
                                  </SubmitButton>
                                </form>
                              )}
                            </div>
                          </div>
                        </ManagementDetails>
                      </article>
                    );
                  })
                )}
              </section>
            )}

            {currentView === "workspaces" && (
              <section className="mt-5">
                {workspaces.length === 0 ? (
                  <EmptyText>검색 조건에 맞는 워크스페이스가 없습니다.</EmptyText>
                ) : (
                  workspaces.map((workspace) => (
                    <article key={workspace.id} className="border-t border-border py-4">
                      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-semibold">{workspace.name}</h3>
                            <StatusPill tone={workspace.deletedAt ? "warn" : "good"}>{workspace.deletedAt ? "보관됨" : "운영중"}</StatusPill>
                          </div>
                          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{workspace.slug}</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            소유자 {workspace.members.map((member) => member.user.name || member.user.email).join(", ") || "없음"}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs text-muted-foreground lg:text-right">
                          <span>멤버 {workspace._count.members}</span>
                          <span>프로젝트 {workspace._count.projects}</span>
                          <span>레코드 {workspace._count.collectRecords}</span>
                          <span>웨비나 {workspace._count.webinars}</span>
                        </div>
                      </div>
                      <ManagementDetails>
                        <div className="grid grid-cols-1 gap-2 xl:grid-cols-[1fr_360px]">
                          <form action={renameWorkspaceAction} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                            <input type="hidden" name="workspaceId" value={workspace.id} />
                            <input name="name" defaultValue={workspace.name} aria-label="워크스페이스 이름" className="h-9 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-violet-400" />
                            <input name="reason" placeholder="변경 사유" aria-label="워크스페이스 이름 변경 사유" className="h-9 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-violet-400" />
                            <SubmitButton>이름 변경</SubmitButton>
                          </form>
                          <form action={setWorkspaceArchivedAction} className="grid grid-cols-[1fr_auto] gap-2">
                            <input type="hidden" name="workspaceId" value={workspace.id} />
                            <input type="hidden" name="mode" value={workspace.deletedAt ? "restore" : "archive"} />
                            <input name="reason" required placeholder={workspace.deletedAt ? "복구 사유" : "보관 사유"} aria-label="워크스페이스 보관 또는 복구 사유" className="h-9 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-violet-400" />
                            <SubmitButton tone={workspace.deletedAt ? "good" : "danger"}>
                              {workspace.deletedAt ? <ArchiveRestore className="mr-1 size-3.5" /> : <Archive className="mr-1 size-3.5" />}
                              {workspace.deletedAt ? "복구" : "보관"}
                            </SubmitButton>
                          </form>
                        </div>
                      </ManagementDetails>
                    </article>
                  ))
                )}
              </section>
            )}

            {currentView === "projects" && (
              <section className="mt-5 grid grid-cols-1 gap-8 xl:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold">프로젝트</h3>
                  <div className="mt-2">
                    {projects.length === 0 ? (
                      <EmptyText>검색 조건에 맞는 프로젝트가 없습니다.</EmptyText>
                    ) : (
                      projects.map((project) => (
                        <article key={project.id} className="border-t border-border py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="truncate text-sm font-semibold">{project.name}</h4>
                                <StatusPill tone={project.deletedAt || project.workspace.deletedAt ? "warn" : "good"}>
                                  {project.deletedAt ? "보관됨" : project.workspace.deletedAt ? "워크스페이스 보관" : "운영중"}
                                </StatusPill>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{project.workspace.name}</p>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              수집 {project._count.collectSources} · 레코드 {project._count.collectRecords} · 웨비나 {project._count.webinars}
                            </p>
                          </div>
                          <ManagementDetails>
                            <div className="space-y-2">
                              <form action={renameProjectAction} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                                <input type="hidden" name="projectId" value={project.id} />
                                <input name="name" defaultValue={project.name} aria-label="프로젝트 이름" className="h-9 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-violet-400" />
                                <input name="description" defaultValue={project.description ?? ""} placeholder="설명" aria-label="프로젝트 설명" className="h-9 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-violet-400" />
                                <SubmitButton>저장</SubmitButton>
                              </form>
                              <form action={setProjectArchivedAction} className="grid grid-cols-[1fr_auto] gap-2">
                                <input type="hidden" name="projectId" value={project.id} />
                                <input type="hidden" name="mode" value={project.deletedAt ? "restore" : "archive"} />
                                <input name="reason" required placeholder={project.deletedAt ? "복구 사유" : "보관 사유"} aria-label="프로젝트 보관 또는 복구 사유" className="h-9 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-violet-400" />
                                <SubmitButton tone={project.deletedAt ? "good" : "danger"}>{project.deletedAt ? "복구" : "보관"}</SubmitButton>
                              </form>
                            </div>
                          </ManagementDetails>
                        </article>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold">수집 소스</h3>
                  <div className="mt-2">
                    {collectSources.length === 0 ? (
                      <EmptyText>검색 조건에 맞는 수집 소스가 없습니다.</EmptyText>
                    ) : (
                      collectSources.map((source) => (
                        <article key={source.id} className="border-t border-border py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="truncate text-sm font-semibold">{source.name}</h4>
                                <StatusPill tone={source.deletedAt ? "warn" : source.isActive ? "good" : "danger"}>
                                  {source.deletedAt ? "삭제됨" : source.isActive ? "활성" : "중지"}
                                </StatusPill>
                                {source.webhookUrl && <StatusPill>webhook</StatusPill>}
                              </div>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {source.workspace.name} · {source.project.name}
                              </p>
                              <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                                {source.apiKey.slice(0, 10)}... · {source.siteUrl || "site url 없음"}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              레코드 {source._count.records} · 필드 {source._count.fieldMappings} · 알림 {source.notifyOnSubmit ? "on" : "off"}
                            </p>
                          </div>
                          <ManagementDetails>
                            <form action={setCollectSourceActiveAction} className="grid grid-cols-[1fr_auto] gap-2">
                              <input type="hidden" name="sourceId" value={source.id} />
                              <input type="hidden" name="mode" value={source.isActive ? "pause" : "activate"} />
                              <input name="reason" required placeholder={source.isActive ? "중지 사유" : "활성화 사유"} aria-label="수집 소스 상태 변경 사유" className="h-9 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-violet-400" />
                              <SubmitButton tone={source.isActive ? "danger" : "good"}>
                                {source.isActive ? <PauseCircle className="mr-1 size-3.5" /> : <PlayCircle className="mr-1 size-3.5" />}
                                {source.isActive ? "중지" : "활성"}
                              </SubmitButton>
                            </form>
                          </ManagementDetails>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              </section>
            )}

            {currentView === "activity" && (
              <section className="mt-5">
                <div className="divide-y divide-border border-t border-border">
                  {recentActivities.length === 0 ? (
                    <EmptyText>최근 활동 로그가 없습니다.</EmptyText>
                  ) : (
                    recentActivities.map((log) => (
                      <div key={log.id} className="grid grid-cols-[1fr_auto] gap-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{log.action}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {log.workspace.name} · {log.user?.name || log.user?.email || "system"}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatKstDateTime(log.createdAt)}</span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

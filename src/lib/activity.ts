import { prisma } from "@/lib/prisma";

export type ActivityAction =
  | "source.created"
  | "source.updated"
  | "source.deleted"
  | "source.key_regenerated"
  | "record.created"
  | "record.updated"
  | "record.deleted"
  | "records.bulk_deleted"
  | "records.imported"
  | "records.cleaned"
  | "records.normalized"
  | "records.exported"
  | "collect.records.exported"
  | "workspace.member.invited"
  | "workspace.member.role_changed"
  | "workspace.member.removed"
  | "apiToken.created"
  | "apiToken.revoked"
  | "dashboardShareToken.rotated"
  | "webinar.registrations.exported"
  | "scheduledReport.delivered"
  | "scheduledReport.delivery_failed";

export async function logActivity(args: {
  workspaceId: string;
  sourceId?: string | null;
  userId?: string | null;
  action: ActivityAction;
  meta?: Record<string, unknown>;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        workspaceId: args.workspaceId,
        sourceId: args.sourceId ?? null,
        userId: args.userId ?? null,
        action: args.action,
        meta: (args.meta ?? null) as never,
      },
    });
  } catch (e) {
    // 로그 실패는 본 작업을 방해하지 않음
    console.error("[activity] failed to log", args.action, e);
  }
}

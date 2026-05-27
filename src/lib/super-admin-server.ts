// 슈퍼관리자 — DB + env 통합 체크. 서버 전용 (prisma import).
import "server-only";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/super-admin";

export async function checkSuperAdminAccess(
  authUser: { id: string; email?: string | null } | null,
): Promise<boolean> {
  if (!authUser) return false;
  // env 기반 root admin은 즉시 통과
  if (isSuperAdminEmail(authUser.email)) return true;
  // DB 플래그 체크
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { isSuperAdmin: true },
    });
    return dbUser?.isSuperAdmin === true;
  } catch {
    return false;
  }
}

// 슈퍼관리자 권한 체크.
// 1) 환경변수 SUPER_ADMIN_EMAILS (콤마 구분) — root 어드민, UI에서 회수 불가
// 2) User.isSuperAdmin = true (DB) — 관리자 페이지에서 부여/회수 가능

import { prisma } from "@/lib/prisma";

const FALLBACK_EMAIL = "lynlea@exporum.com";

const ENV_VALUE = process.env.SUPER_ADMIN_EMAILS?.trim();
const ADMIN_EMAILS = (ENV_VALUE && ENV_VALUE.length > 0 ? ENV_VALUE : FALLBACK_EMAIL)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// 표시용 — 첫 번째 이메일 (기존 UI 호환).
export const SUPER_ADMIN_EMAIL = ADMIN_EMAILS[0] ?? FALLBACK_EMAIL;

// env 기반 root 슈퍼관리자 체크 (sync, 항상 권한 있음, UI에서 회수 불가).
export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

// 기존 alias 유지.
export const isSuperAdmin = isSuperAdminEmail;

// DB + env 통합 체크 (async). 서버 컴포넌트/액션에서 호출.
export async function checkSuperAdminAccess(authUser: { id: string; email?: string | null } | null): Promise<boolean> {
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

// 이 이메일이 env-rooted 어드민인지 (DB 부여 어드민과 구분용)
export function isRootSuperAdmin(email?: string | null): boolean {
  return isSuperAdminEmail(email);
}

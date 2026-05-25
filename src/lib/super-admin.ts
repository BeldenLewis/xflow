// 슈퍼관리자 이메일 목록. 환경변수 SUPER_ADMIN_EMAILS (콤마 구분) 우선.
// 없으면 하드코딩 폴백 (개발 환경 호환).

const FALLBACK_EMAIL = "lynlea@exporum.com";

const ENV_VALUE = process.env.SUPER_ADMIN_EMAILS?.trim();
const ADMIN_EMAILS = (ENV_VALUE && ENV_VALUE.length > 0 ? ENV_VALUE : FALLBACK_EMAIL)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// 표시용 — 첫 번째 이메일 (기존 UI 호환).
export const SUPER_ADMIN_EMAIL = ADMIN_EMAILS[0] ?? FALLBACK_EMAIL;

export function isSuperAdmin(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

// 기존 호출자 호환 alias.
export const isSuperAdminEmail = isSuperAdmin;

export const SUPER_ADMIN_EMAIL = "lynlea@exporum.com";

export function isSuperAdminEmail(email?: string | null) {
  return email?.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

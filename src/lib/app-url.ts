export function getPublicAppOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function getAuthCallbackUrl() {
  const origin = getPublicAppOrigin();
  if (!origin) return "/auth/callback";
  return new URL("/auth/callback", origin).toString();
}

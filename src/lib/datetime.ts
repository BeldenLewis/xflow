// 이 플랫폼의 모든 사용자 노출 시간은 한국시간(KST) 기준이에요.
// 저장은 UTC ISO로 하되, 표시/파일명/필터링은 항상 이 유틸을 통해 KST로 변환합니다.

export const KST = "Asia/Seoul";

function toDate(input: Date | string | number): Date {
  return input instanceof Date ? input : new Date(input);
}

export function formatKst(
  input: Date | string | number,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" },
): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: KST, ...options }).format(toDate(input));
}

// "YYYY-MM-DD HH:mm:ss" KST (CSV/엑셀에 쓰기 좋은 형식)
export function formatKstDateTime(input: Date | string | number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(toDate(input));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

// "YYYY-MM-DD" KST (파일명용)
export function kstDateString(input: Date | string | number = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(toDate(input));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function kstYear(input: Date | string | number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: KST, year: "numeric" }).format(toDate(input));
}

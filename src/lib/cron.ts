// 매우 간단한 cron 파서 — 분 시 일 월 요일 (* 또는 숫자 또는 콤마 리스트 또는 */N)
// 표현 예:
//   "*/30 * * * *"   매 30분
//   "0 9 * * *"      매일 9시
//   "0 9 * * 1"      매주 월 9시 (0=일요일, 1=월)

interface ParsedField {
  matches: (n: number) => boolean;
}

function parseField(spec: string, min: number, max: number): ParsedField {
  if (spec === "*") return { matches: () => true };
  if (spec.startsWith("*/")) {
    const step = parseInt(spec.slice(2));
    return { matches: (n) => (n - min) % step === 0 };
  }
  const values = spec.split(",").flatMap((part) => {
    if (part.includes("-")) {
      const [a, b] = part.split("-").map((x) => parseInt(x));
      const out: number[] = [];
      for (let i = a; i <= b; i++) out.push(i);
      return out;
    }
    return [parseInt(part)];
  }).filter((n) => !isNaN(n) && n >= min && n <= max);
  const set = new Set(values);
  return { matches: (n) => set.has(n) };
}

export function parseCron(expr: string) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("cron 은 5 필드여야 합니다");
  const [m, h, d, mo, w] = parts;
  return {
    min: parseField(m, 0, 59),
    hour: parseField(h, 0, 23),
    day: parseField(d, 1, 31),
    month: parseField(mo, 1, 12),
    dow: parseField(w, 0, 6),
  };
}

// KST 기준으로 cron 만족 여부 검사
export function cronMatchesKst(expr: string, date: Date): boolean {
  try {
    const c = parseCron(expr);
    const kst = new Date(date.getTime() + 9 * 60 * 60_000);
    return (
      c.min.matches(kst.getUTCMinutes()) &&
      c.hour.matches(kst.getUTCHours()) &&
      c.day.matches(kst.getUTCDate()) &&
      c.month.matches(kst.getUTCMonth() + 1) &&
      c.dow.matches(kst.getUTCDay())
    );
  } catch {
    return false;
  }
}

// 다음 실행 시각 계산 (대략 — 1분 단위로 검사)
export function nextRunFromNow(expr: string, from: Date = new Date()): Date | null {
  try {
    parseCron(expr);
    const ceil = new Date(Math.ceil(from.getTime() / 60_000) * 60_000);
    for (let i = 0; i < 60 * 24 * 31; i++) {
      const t = new Date(ceil.getTime() + i * 60_000);
      if (cronMatchesKst(expr, t)) return t;
    }
    return null;
  } catch {
    return null;
  }
}

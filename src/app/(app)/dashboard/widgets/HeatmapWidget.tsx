"use client";

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

export default function HeatmapWidget({ matrix, max }: { matrix: number[][]; max: number }) {
  if (!matrix || matrix.length === 0 || max === 0) {
    return <div className="text-xs text-muted-foreground text-center py-8">데이터 없음</div>;
  }
  // 0~max 를 0~1 로 정규화, 색 강도 = violet alpha
  const cellColor = (v: number) => {
    if (v === 0) return "rgba(139, 92, 246, 0.05)";
    const intensity = Math.min(1, v / max);
    const alpha = 0.15 + intensity * 0.8;
    return `rgba(139, 92, 246, ${alpha.toFixed(2)})`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="text-[10px] border-separate border-spacing-0.5">
        <thead>
          <tr>
            <th className="w-6"></th>
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="text-muted-foreground font-normal text-center w-4">
                {h % 3 === 0 ? h : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, dow) => (
            <tr key={dow}>
              <td className="text-muted-foreground pr-1 text-right">{DAYS[dow]}</td>
              {row.map((v, h) => (
                <td
                  key={h}
                  className="w-4 h-4 rounded-sm"
                  style={{ backgroundColor: cellColor(v) }}
                  title={`${DAYS[dow]} ${h}시: ${v}건`}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-muted-foreground mt-2">최대 {max}건 · KST 기준 · 색이 진할수록 제출 많음</p>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">대시보드</h1>
      <p className="mt-1 text-muted-foreground">안녕하세요! 오늘도 좋은 하루 되세요.</p>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "이번 달 UTM 생성", value: "0" },
          { label: "활성 프로젝트", value: "0" },
          { label: "팀 멤버", value: "1" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="font-medium">최근 활동</h2>
        <p className="mt-4 text-sm text-muted-foreground text-center py-8">
          아직 활동 내역이 없습니다.
        </p>
      </div>
    </div>
  );
}

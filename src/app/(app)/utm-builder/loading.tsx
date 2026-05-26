import { Skeleton } from "@/components/ui/skeleton";

export default function UtmBuilderLoading() {
  return (
    <div className="p-6 space-y-6" aria-label="UTM 빌더 로딩 중">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* 필터 */}
      <div className="rounded-2xl border border-border bg-background p-4 flex flex-wrap gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-40 rounded-lg" />
        ))}
        <Skeleton className="h-9 w-24 rounded-lg ml-auto" />
      </div>

      {/* 테이블 */}
      <div className="rounded-2xl border border-border bg-background p-5 space-y-3">
        <div className="flex gap-3 pb-2 border-b border-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex gap-3 py-1">
            {Array.from({ length: 6 }).map((_, j) => (
              <Skeleton key={j} className="h-8 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

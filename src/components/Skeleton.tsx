import { cn } from "@/lib/utils";

export function Skeleton({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div className={cn("halo-skeleton rounded-2xl bg-white/[0.04]", className)}>{children}</div>;
}

export function PageHeaderSkeleton({ title = "w-56" }: { title?: string }) {
  return (
    <div className="mb-8">
      <Skeleton className="h-4 w-40" />
      <Skeleton className={`mt-3 h-10 ${title}`} />
    </div>
  );
}

export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-[118px]" />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, minWidth = "min-w-[760px]" }: { rows?: number; minWidth?: string }) {
  return (
    <Skeleton className="overflow-hidden rounded-2xl">
      <div className="border-b border-white/[0.08] p-5">
        <div className="h-5 w-44 rounded-lg bg-white/[0.08]" />
      </div>
      <div className="overflow-x-auto p-5">
        <div className={`space-y-3 ${minWidth}`}>
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="grid grid-cols-5 gap-4">
              <div className="h-4 rounded-md bg-white/[0.08]" />
              <div className="h-4 rounded-md bg-white/[0.08]" />
              <div className="h-4 rounded-md bg-white/[0.08]" />
              <div className="h-4 rounded-md bg-white/[0.08]" />
              <div className="h-4 rounded-md bg-white/[0.08]" />
            </div>
          ))}
        </div>
      </div>
    </Skeleton>
  );
}

export function CardsGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-40" />
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <StatsGridSkeleton />
      <Skeleton className="h-[176px]" />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Skeleton className="h-[330px]" />
        <Skeleton className="h-[330px]" />
      </div>
      <TableSkeleton rows={7} />
    </div>
  );
}

export function ListPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <CardsGridSkeleton />
    </div>
  );
}

export function BillingSkeleton() {
  return (
    <div className="space-y-6">
      <StatsGridSkeleton count={3} />
      <TableSkeleton rows={8} minWidth="min-w-[820px]" />
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <Skeleton className="h-10 w-40 rounded-xl" />
        <Skeleton className="h-10 w-56 rounded-xl" />
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-[120px] rounded-xl" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

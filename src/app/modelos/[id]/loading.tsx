import { PanelLayout } from "@/components/PanelLayout";
import { CardsGridSkeleton, PageHeaderSkeleton, StatsGridSkeleton, TableSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PanelLayout>
      <div className="space-y-6">
        <PageHeaderSkeleton title="w-56" />
        <StatsGridSkeleton />
        <CardsGridSkeleton count={2} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TableSkeleton rows={5} />
          <TableSkeleton rows={5} />
        </div>
      </div>
    </PanelLayout>
  );
}

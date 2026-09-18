import { PanelLayout } from "@/components/PanelLayout";
import { PageHeaderSkeleton, StatsGridSkeleton, TableSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PanelLayout>
      <PageHeaderSkeleton title="w-48" />
      <div className="space-y-8">
        <StatsGridSkeleton count={4} />
        <TableSkeleton rows={6} />
      </div>
    </PanelLayout>
  );
}

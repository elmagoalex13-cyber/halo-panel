import { PanelLayout } from "@/components/PanelLayout";
import { DashboardSkeleton, PageHeaderSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PanelLayout>
      <PageHeaderSkeleton title="w-72" />
      <DashboardSkeleton />
    </PanelLayout>
  );
}

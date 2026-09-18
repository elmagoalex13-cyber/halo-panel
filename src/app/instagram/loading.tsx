import { PanelLayout } from "@/components/PanelLayout";
import { ListPageSkeleton, PageHeaderSkeleton, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PanelLayout>
      <PageHeaderSkeleton title="w-52" />
      <div className="mb-6 flex gap-2 border-b border-white/[0.08] pb-2">
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <ListPageSkeleton />
    </PanelLayout>
  );
}

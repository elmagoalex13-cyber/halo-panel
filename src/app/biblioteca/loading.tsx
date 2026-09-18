import { PanelLayout } from "@/components/PanelLayout";
import { ListPageSkeleton, PageHeaderSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PanelLayout>
      <PageHeaderSkeleton title="w-52" />
      <ListPageSkeleton />
    </PanelLayout>
  );
}

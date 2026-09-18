import { PanelLayout } from "@/components/PanelLayout";
import { PageHeaderSkeleton, TableSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PanelLayout>
      <PageHeaderSkeleton title="w-44" />
      <TableSkeleton rows={7} />
    </PanelLayout>
  );
}

import { PanelLayout } from "@/components/PanelLayout";
import { PageHeaderSkeleton, TableSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PanelLayout>
      <PageHeaderSkeleton title="w-52" />
      <TableSkeleton rows={8} />
    </PanelLayout>
  );
}

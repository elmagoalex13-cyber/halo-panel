import { PanelLayout } from "@/components/PanelLayout";
import { Skeleton, TableSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PanelLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-7 w-56" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-28 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </div>
        <TableSkeleton rows={5} />
      </div>
    </PanelLayout>
  );
}

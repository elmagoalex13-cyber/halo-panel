import { PanelLayout } from "@/components/PanelLayout";
import { Skeleton, TableSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PanelLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-2 h-4 w-24" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-14 rounded-md" />
            <Skeleton className="h-8 w-16 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        </div>
        <TableSkeleton rows={8} />
      </div>
    </PanelLayout>
  );
}

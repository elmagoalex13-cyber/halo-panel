import { PanelLayout } from "@/components/PanelLayout";
import { CardsGridSkeleton, PageHeaderSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PanelLayout>
      <PageHeaderSkeleton title="w-36" />
      <CardsGridSkeleton count={4} />
    </PanelLayout>
  );
}

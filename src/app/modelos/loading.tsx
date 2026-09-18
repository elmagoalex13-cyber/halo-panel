import { PanelLayout } from "@/components/PanelLayout";
import { CardsGridSkeleton, PageHeaderSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PanelLayout>
      <PageHeaderSkeleton title="w-44" />
      <CardsGridSkeleton count={6} />
    </PanelLayout>
  );
}

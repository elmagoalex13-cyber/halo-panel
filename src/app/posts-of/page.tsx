import { PanelLayout } from "@/components/PanelLayout";
import { PostsOfClient } from "./PostsOfClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Posts por programar" };

export default function PostsOfPage() {
  return (
    <PanelLayout>
      <div className="mb-6">
        <p className="text-sm text-[color:var(--text-secondary)]">Posts de OnlyFans con caption de la IA, para revisar</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-white">Posts por programar</h1>
      </div>
      <PostsOfClient />
    </PanelLayout>
  );
}

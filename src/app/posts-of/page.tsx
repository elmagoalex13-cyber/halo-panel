import { PanelLayout } from "@/components/PanelLayout";
import { PostsOfClient } from "./PostsOfClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Posts por programar" };

export default function PostsOfPage() {
  return (
    <PanelLayout>
      <div className="mb-6">
        <p className="text-sm text-[color:var(--text-secondary)]">OnlyFans · con caption de tu banco, para revisar y mandar a Venuz</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-white">Por programar</h1>
      </div>
      <PostsOfClient />
    </PanelLayout>
  );
}

function PortalSkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-4 h-5 w-28 animate-pulse rounded-full bg-white/10" />
      <div className="space-y-2">
        {Array.from({ length: lines }, (_, index) => (
          <div
            key={index}
            className="h-3 animate-pulse rounded-full bg-white/10"
            style={{ width: `${index === 0 ? 82 : 64}%` }}
          />
        ))}
      </div>
      <div className="mt-5 h-11 animate-pulse rounded-xl bg-[#8B5CF6]/25" />
    </div>
  );
}

export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl space-y-5 px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-5 sm:pt-6">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-white/40">HALO</p>
          <div className="mt-2 h-8 w-44 animate-pulse rounded-full bg-white/10" />
        </div>
        <div className="h-11 w-20 animate-pulse rounded-xl border border-white/10 bg-white/[0.04]" />
      </header>

      <section className="rounded-2xl border border-[#8B5CF6]/30 bg-[#8B5CF6]/[0.08] p-4 sm:rounded-3xl">
        <div className="h-5 w-40 animate-pulse rounded-full bg-white/10" />
        <div className="mt-3 h-3 w-3/4 animate-pulse rounded-full bg-white/10" />
        <div className="mt-2 h-3 w-1/2 animate-pulse rounded-full bg-white/10" />
      </section>

      <div className="grid grid-cols-2 gap-3">
        <div className="h-32 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
        <div className="h-32 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
        <div className="h-11 animate-pulse rounded-xl bg-[#8B5CF6]/20" />
        <div className="h-11 animate-pulse rounded-xl bg-white/5" />
        <div className="h-11 animate-pulse rounded-xl bg-white/5" />
      </div>

      <section className="space-y-3">
        <PortalSkeletonCard />
        <PortalSkeletonCard lines={3} />
      </section>
    </main>
  );
}

"use client";

export function VideoPlayer({ src, title }: { src: string; title: string }) {
  return (
    <video
      className="aspect-[9/16] max-h-[520px] w-full rounded-[14px] border border-white/[0.08] bg-black/30 object-cover"
      controls
      preload="metadata"
      src={src}
      title={title}
    />
  );
}

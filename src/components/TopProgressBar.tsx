"use client";

import NextTopLoader from "nextjs-toploader";

export function TopProgressBar() {
  return (
    <NextTopLoader
      color="#8B5CF6"
      height={2}
      crawlSpeed={180}
      showSpinner={false}
      shadow="0 0 12px rgba(139, 92, 246, 0.65)"
      zIndex={9999}
    />
  );
}

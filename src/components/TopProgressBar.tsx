"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function TopProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVisible(true);
    setWidth(30);
    timer.current = setTimeout(() => setWidth(80), 200);
    const done = setTimeout(() => {
      setWidth(100);
      setTimeout(() => { setVisible(false); setWidth(0); }, 300);
    }, 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      clearTimeout(done);
    };
  }, [pathname, searchParams]);

  if (!visible) return null;
  return (
    <div
      style={{
        position: "fixed", top: 0, left: 0, height: 2, zIndex: 9999,
        width: `${width}%`,
        background: "linear-gradient(90deg, #8B5CF6, #EC4899)",
        boxShadow: "0 0 12px rgba(139,92,246,0.65)",
        transition: "width 0.3s ease",
        pointerEvents: "none",
      }}
    />
  );
}

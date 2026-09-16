"use client";

import { useState } from "react";

export function VenuzSyncButton() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");

  async function handleSync() {
    setLoading(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/venuz/sync", { method: "POST" });
      const json = await res.json();
      setStatus(json.ok ? "ok" : "error");
    } catch {
      setStatus("error");
    } finally {
      setLoading(false);
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={loading}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        status === "ok"
          ? "border-green-500/40 bg-green-500/10 text-green-400"
          : status === "error"
            ? "border-red-500/40 bg-red-500/10 text-red-400"
            : "border-halo-border text-halo-subtle hover:text-halo-text"
      }`}
    >
      {loading ? "⟳ Sincronizando..." : status === "ok" ? "✓ Sync ok" : status === "error" ? "✗ Error" : "⟳ Sync Venuz"}
    </button>
  );
}

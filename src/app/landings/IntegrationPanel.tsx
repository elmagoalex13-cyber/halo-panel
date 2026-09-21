"use client";

import { useState } from "react";
import { ChevronDown, Code2 } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";

type IntegrationPanelProps = {
  endpointUrl: string;
  slug: string;
  landingKey: string;
  publicUrl: string;
};

export function IntegrationPanel({ endpointUrl, slug, landingKey, publicUrl }: IntegrationPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <GlassCard className="mt-6 p-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
            <Code2 className="h-4 w-4 text-[#A78BFA]" />
          </span>
          <span>
            <span className="block font-display text-base font-semibold text-white">Endpoint e integración</span>
            <span className="mt-0.5 block text-xs text-white/40">Script HTML/JS y claves de la landing seleccionada</span>
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 text-white/45 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="mt-5 border-t border-white/[0.08] pt-5">
          <p className="text-sm text-white/45">Endpoint público final:</p>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-white/[0.08] bg-black/30 p-4 font-code text-xs text-white/75">
            {endpointUrl}
          </pre>

          <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <MiniInfo label="landingSlug" value={slug} />
            <MiniInfo label="landingKey" value={landingKey} />
            <MiniInfo label="URL pública" value={publicUrl} />
          </div>

          <p className="mt-5 text-sm text-white/45">Ejemplo mínimo de script HTML/JS:</p>
          <pre className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-white/[0.08] bg-black/30 p-4 font-code text-xs leading-relaxed text-white/75">
{`<script>
  const HALO_ENDPOINT = "${endpointUrl}";
  const HALO_LANDING_SLUG = "${slug}";
  const HALO_LANDING_KEY = "${landingKey}";

  function getHaloSessionId() {
    const key = "halo_landing_session";
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  }

  function trackHaloLanding(eventType, extra = {}) {
    return fetch(HALO_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        landingSlug: HALO_LANDING_SLUG,
        landingKey: HALO_LANDING_KEY,
        eventType,
        sessionId: getHaloSessionId(),
        referrer: document.referrer,
        page: location.pathname,
        url: location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        ...extra
      })
    }).catch(() => {});
  }

  trackHaloLanding("pageview");

  document.addEventListener("click", (event) => {
    const link = event.target.closest && event.target.closest("a[href]");
    if (!link) return;

    const href = link.href || link.getAttribute("href") || "";
    const text = (link.getAttribute("aria-label") || link.textContent || "").trim().slice(0, 80);
    const isOnlyFans = /onlyfans/i.test(href) || link.hasAttribute("data-halo-of-click");
    const isLinksPage = /links\\.html/i.test(href) || /links/i.test(text);

    trackHaloLanding("click", {
      label: link.getAttribute("data-halo-of-click") ||
        link.getAttribute("data-halo-click") ||
        (isOnlyFans ? "onlyfans" : isLinksPage ? "links-page" : text || "link"),
      destination: href
    });
  }, true);
</script>`}
          </pre>

          <p className="mt-3 text-xs text-white/35">
            Para links normales usa <span className="font-code">data-halo-click=&quot;instagram&quot;</span>. Para OnlyFans usa{" "}
            <span className="font-code">data-halo-of-click=&quot;hero-onlyfans&quot;</span>.
          </p>
        </div>
      ) : null}
    </GlassCard>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
      <p className="text-xs text-white/35">{label}</p>
      <p className="mt-1 break-all font-code text-xs text-white/75">{value}</p>
    </div>
  );
}

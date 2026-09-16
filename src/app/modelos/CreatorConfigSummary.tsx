import type { CreatorConfig } from "@/types";

export function CreatorConfigSummary({ config }: { config: CreatorConfig }) {
  return (
    <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <Section title="Identity">
        <Row label="Persona name" value={config.persona_name} />
        <Row label="Age" value={config.age ? `${config.age} years old` : undefined} />
        <Row label="Origin" value={config.origin} />
        <Row label="Lives in" value={[config.lives_in_city, config.lives_in_country].filter(Boolean).join(", ")} />
        <Row label="Time zone" value={config.timezone} />
      </Section>

      <Section title="Language">
        <Row label="Primary language" value={config.primary_language} />
        <Row label="Additional languages" value={config.other_languages?.join(", ")} />
        <Row label="Regional flavor" value={config.regional_flavor} />
      </Section>

      <Section title="Archetype & personality">
        <Row label="Archetype" value={config.archetype} />
        <Row label="Capitalization" value={config.capitalization} />
        {config.unique_details ? <Paragraph label="Unique details" text={config.unique_details} /> : null}
        {config.persona_lore ? <Paragraph label="Backstory" text={config.persona_lore} /> : null}
        {config.account_context ? <Paragraph label="Account context" text={config.account_context} /> : null}
      </Section>

      {config.physical_description ? (
        <Section title="Physical">
          <Paragraph label="Description" text={config.physical_description} />
        </Section>
      ) : null}

      <Section title="Boundaries">
        <p className="mb-1 text-[11px] text-white/35">Custom content — hard no&apos;s</p>
        {config.hard_limits && config.hard_limits.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {config.hard_limits.map((limit) => (
              <span key={limit} className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300">
                {limit}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-white/30">Nada marcado — todo se asume negociable.</p>
        )}
        {config.other_limits ? <Paragraph label="Other custom limits" text={config.other_limits} /> : null}
        {config.topic_limits ? <Paragraph label="Topic limits" text={config.topic_limits} /> : null}
      </Section>

      {config.custom_pricing_enabled ? (
        <Section title="Pricing">
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Foto min" value={config.photo_min_price != null ? `$${config.photo_min_price}` : "—"} />
            <Metric label="Video min" value={config.video_min_price != null ? `$${config.video_min_price}` : "—"} />
            <Metric label="Video / min" value={config.video_price_per_minute != null ? `$${config.video_price_per_minute}` : "—"} />
          </div>
        </Section>
      ) : null}

      {config.optional_details ? (
        <Section title="Optional">
          <Paragraph label="Detalles adicionales" text={config.optional_details} />
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-white/40">{label}</span>
      <span className="text-right font-medium text-white/85">{value}</span>
    </div>
  );
}

function Paragraph({ label, text }: { label: string; text: string }) {
  return (
    <div className="text-xs">
      <p className="text-white/40">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-white/75">{text}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-2 text-center">
      <p className="text-[10px] text-white/30">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

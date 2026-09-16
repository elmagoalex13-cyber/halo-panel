"use client";

import { useState } from "react";
import { GlassCard } from "@/components/GlassCard";
import { CREATOR_LIMIT_OPTIONS } from "@/lib/creatorConfig";
import type { CreatorConfig } from "@/types";

const STEPS = ["Identity", "Archetype", "Physical", "Limits", "Optional"];

export function CreatorConfigWizard({
  initial,
  onCancel,
  onSave,
}: {
  initial: CreatorConfig;
  onCancel: () => void;
  onSave: (config: CreatorConfig) => Promise<void> | void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CreatorConfig>(initial);
  const [langDraft, setLangDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function update<K extends keyof CreatorConfig>(key: K, value: CreatorConfig[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addLanguage() {
    const value = langDraft.trim();
    if (!value) return;
    update("other_languages", [...(form.other_languages ?? []), value]);
    setLangDraft("");
  }

  function removeLanguage(lang: string) {
    update(
      "other_languages",
      (form.other_languages ?? []).filter((l) => l !== lang),
    );
  }

  function toggleLimit(limit: string) {
    const current = form.hard_limits ?? [];
    update("hard_limits", current.includes(limit) ? current.filter((l) => l !== limit) : [...current, limit]);
  }

  async function handleNext() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
      <GlassCard className="max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <h2 className="font-display text-xl font-semibold text-white">Editar creator config</h2>

        <div className="mt-4 flex flex-wrap gap-2 border-b border-white/[0.08] pb-4">
          {STEPS.map((label, index) => (
            <button
              key={label}
              onClick={() => setStep(index)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                index === step ? "bg-[#8B5CF6] text-white" : "bg-white/[0.05] text-white/50 hover:text-white/80"
              }`}
            >
              <span className="grid h-4 w-4 place-items-center rounded-full bg-black/20 text-[10px]">{index + 1}</span>
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-4">
          {step === 0 ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Persona name">
                  <input value={form.persona_name ?? ""} onChange={(e) => update("persona_name", e.target.value)} className="input-base" />
                </Field>
                <Field label="Age">
                  <input
                    type="number"
                    value={form.age ?? ""}
                    onChange={(e) => update("age", e.target.value ? Number(e.target.value) : null)}
                    className="input-base"
                  />
                </Field>
                <Field label="Origin">
                  <input value={form.origin ?? ""} onChange={(e) => update("origin", e.target.value)} className="input-base" />
                </Field>
                <Field label="Lives in (country)">
                  <input value={form.lives_in_country ?? ""} onChange={(e) => update("lives_in_country", e.target.value)} className="input-base" />
                </Field>
                <Field label="Lives in (city)">
                  <input value={form.lives_in_city ?? ""} onChange={(e) => update("lives_in_city", e.target.value)} className="input-base" />
                </Field>
                <Field label="Time zone">
                  <input value={form.timezone ?? ""} onChange={(e) => update("timezone", e.target.value)} className="input-base" />
                </Field>
                <Field label="Primary language">
                  <input value={form.primary_language ?? ""} onChange={(e) => update("primary_language", e.target.value)} className="input-base" />
                </Field>
                <Field label="Regional flavor">
                  <input value={form.regional_flavor ?? ""} onChange={(e) => update("regional_flavor", e.target.value)} className="input-base" />
                </Field>
              </div>
              <Field label="Other fluent languages">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(form.other_languages ?? []).map((lang) => (
                    <span key={lang} className="badge flex items-center gap-1">
                      {lang}
                      <button onClick={() => removeLanguage(lang)} className="text-white/40 hover:text-white">
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    value={langDraft}
                    onChange={(e) => setLangDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addLanguage();
                      }
                    }}
                    placeholder="Anadir idioma..."
                    className="input-base w-40 py-1 text-xs"
                  />
                </div>
              </Field>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Archetype">
                  <input value={form.archetype ?? ""} onChange={(e) => update("archetype", e.target.value)} className="input-base" />
                </Field>
                <Field label="Capitalization">
                  <input value={form.capitalization ?? ""} onChange={(e) => update("capitalization", e.target.value)} className="input-base" />
                </Field>
              </div>
              <Field label="Unique details">
                <textarea
                  value={form.unique_details ?? ""}
                  onChange={(e) => update("unique_details", e.target.value)}
                  rows={2}
                  placeholder="Muletillas, forma de hablar, apodos que usa..."
                  className="input-base resize-none"
                />
              </Field>
              <Field label="Backstory (persona lore)">
                <textarea
                  value={form.persona_lore ?? ""}
                  onChange={(e) => update("persona_lore", e.target.value)}
                  rows={4}
                  placeholder="Historia de vida, personalidad, gustos..."
                  className="input-base resize-none"
                />
              </Field>
              <Field label="Account context">
                <textarea
                  value={form.account_context ?? ""}
                  onChange={(e) => update("account_context", e.target.value)}
                  rows={2}
                  placeholder="Como debe sonar en los chats (tono, estilo)"
                  className="input-base resize-none"
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <Field label="Physical description">
              <textarea
                value={form.physical_description ?? ""}
                onChange={(e) => update("physical_description", e.target.value)}
                rows={4}
                placeholder="Complexion, altura, color de ojos/pelo, tatuajes..."
                className="input-base resize-none"
              />
            </Field>
          ) : null}

          {step === 3 ? (
            <>
              <div>
                <p className="mb-1 text-xs font-semibold text-white/70">Custom content — hard no&apos;s</p>
                <p className="mb-3 text-[11px] text-white/35">
                  Marca solo lo que esta modelo NO hara en customs. Lo que dejes sin marcar se asume negociable.
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {CREATOR_LIMIT_OPTIONS.map((limit) => {
                    const checked = (form.hard_limits ?? []).includes(limit);
                    return (
                      <label
                        key={limit}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition ${
                          checked
                            ? "border-red-500/40 bg-red-500/10 text-red-300"
                            : "border-white/[0.08] bg-white/[0.03] text-white/60 hover:border-white/20"
                        }`}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleLimit(limit)} className="accent-red-500" />
                        {limit}
                      </label>
                    );
                  })}
                </div>
              </div>
              <Field label="Other custom limits">
                <textarea
                  value={form.other_limits ?? ""}
                  onChange={(e) => update("other_limits", e.target.value)}
                  rows={2}
                  maxLength={200}
                  placeholder="Cualquier cosa no cubierta arriba. Vacio si no hay."
                  className="input-base resize-none"
                />
              </Field>
              <Field label="Topic limits">
                <textarea
                  value={form.topic_limits ?? ""}
                  onChange={(e) => update("topic_limits", e.target.value)}
                  rows={2}
                  maxLength={300}
                  placeholder="Temas a evitar en conversacion (politica, religion, drogas...)"
                  className="input-base resize-none"
                />
              </Field>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Precios personalizados de contenido</p>
                  <button
                    onClick={() => update("custom_pricing_enabled", !form.custom_pricing_enabled)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                      form.custom_pricing_enabled ? "bg-[#8B5CF6]" : "bg-white/15"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                        form.custom_pricing_enabled ? "left-5" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>
                {form.custom_pricing_enabled ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Field label="Foto — precio minimo ($)">
                      <input
                        type="number"
                        value={form.photo_min_price ?? ""}
                        onChange={(e) => update("photo_min_price", e.target.value ? Number(e.target.value) : null)}
                        className="input-base"
                      />
                    </Field>
                    <Field label="Video — precio minimo total ($)">
                      <input
                        type="number"
                        value={form.video_min_price ?? ""}
                        onChange={(e) => update("video_min_price", e.target.value ? Number(e.target.value) : null)}
                        className="input-base"
                      />
                    </Field>
                    <Field label="Video — precio por minuto ($)">
                      <input
                        type="number"
                        value={form.video_price_per_minute ?? ""}
                        onChange={(e) => update("video_price_per_minute", e.target.value ? Number(e.target.value) : null)}
                        className="input-base"
                      />
                    </Field>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <Field label="Detalles adicionales opcionales">
              <textarea
                value={form.optional_details ?? ""}
                onChange={(e) => update("optional_details", e.target.value)}
                rows={4}
                className="input-base resize-none"
              />
            </Field>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-white/[0.08] pt-4">
          <button onClick={onCancel} className="btn-secondary px-4 py-2 text-sm">
            Cancelar
          </button>
          <div className="flex gap-2">
            {step > 0 ? (
              <button onClick={() => setStep(step - 1)} className="btn-secondary px-4 py-2 text-sm">
                ← Atras
              </button>
            ) : null}
            <button onClick={handleNext} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-40">
              {saving ? "Guardando..." : step === STEPS.length - 1 ? "Guardar" : "Guardar y continuar"}
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-[color:var(--text-secondary)]">
      {label}
      {children}
    </label>
  );
}

"use client";

import { useEffect, useState } from "react";

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

interface Config {
  dias_alerta: number;
  dias_critico: number;
  min_videos_mes: number;
  objetivo_videos_semana: number;
  notif_telegram: boolean;
  agencia_nombre: string;
  moneda: string;
  // Instagram strategy
  hashtags: string[];           // 5 hashtags pool (sin #)
  posting_days: number[];       // 0=Dom..6=Sáb
  posting_times: string[];      // ["09:00", "18:00"]
  posts_per_day: number;
  pubbler_workspace_id: string;
  pubbler_api_key: string;
}

const DEFAULTS: Config = {
  dias_alerta: 5,
  dias_critico: 7,
  min_videos_mes: 4,
  objetivo_videos_semana: 2,
  notif_telegram: true,
  agencia_nombre: "Halo Models",
  moneda: "EUR",
  hashtags: ["", "", "", "", ""],
  posting_days: [1, 3, 5],
  posting_times: ["09:00", "18:00"],
  posts_per_day: 1,
  pubbler_workspace_id: "",
  pubbler_api_key: "",
};

export function AjustesClient() {
  const [config, setConfig] = useState<Config>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const s = localStorage.getItem("halo-config");
      if (s) setConfig({ ...DEFAULTS, ...JSON.parse(s) });
    } catch {}
  }, []);

  // R2 import state
  const [importStatus, setImportStatus] = useState<null | { missing_count: number; missing_keys: string[]; total_r2: number; already_imported: number }>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importDone, setImportDone] = useState<{ imported: number } | null>(null);

  // Telegram bot state
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<null | { ok: boolean; error?: string; result?: { url?: string; last_error_message?: string } }>(null);
  const [telegramDone, setTelegramDone] = useState(false);
  const [appUrl, setAppUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setAppUrl(window.location.origin);
  }, []);

  function set<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function setHashtag(index: number, value: string) {
    const next = [...config.hashtags];
    next[index] = value.replace(/^#/, "");
    set("hashtags", next);
  }

  function setTime(index: number, value: string) {
    const next = [...config.posting_times];
    next[index] = value;
    set("posting_times", next);
  }

  function toggleDay(day: number) {
    const next = config.posting_days.includes(day)
      ? config.posting_days.filter((d) => d !== day)
      : [...config.posting_days, day].sort();
    set("posting_days", next);
  }

  function save() {
    try {
      localStorage.setItem("halo-config", JSON.stringify(config));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  }

  async function checkR2() {
    setImportLoading(true);
    setImportDone(null);
    try {
      const res = await fetch("/api/admin/r2-import");
      const data = await res.json() as { missing_count: number; missing_keys: string[]; total_r2: number; already_imported: number };
      setImportStatus(data);
    } catch (e) { console.error(e); } finally { setImportLoading(false); }
  }

  async function importR2() {
    setImportLoading(true);
    try {
      const res = await fetch("/api/admin/r2-import", { method: "POST" });
      const data = await res.json() as { imported: number };
      setImportDone(data);
      setImportStatus(null);
    } catch (e) { console.error(e); } finally { setImportLoading(false); }
  }

  async function checkTelegramWebhook() {
    setTelegramLoading(true);
    setTelegramDone(false);
    try {
      const res = await fetch("/api/telegram/setup");
      const data = await res.json() as { ok: boolean; error?: string; result?: { url?: string; last_error_message?: string } };
      setTelegramStatus(data);
    } catch (e) { console.error(e); } finally { setTelegramLoading(false); }
  }

  async function setupTelegramWebhook() {
    setTelegramLoading(true);
    setTelegramDone(false);
    try {
      const res = await fetch("/api/telegram/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: `${appUrl}/api/telegram/webhook` }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) { setTelegramDone(true); setTelegramStatus(null); }
      else setTelegramStatus(data as { ok: boolean; error?: string });
    } catch (e) { console.error(e); } finally { setTelegramLoading(false); }
  }

  const hashtagCombinations = (() => {
    // All C(5,3) = 10 combinations for rotation preview
    const pool = config.hashtags.filter(Boolean);
    if (pool.length < 3) return [];
    const combos: string[][] = [];
    for (let i = 0; i < pool.length - 2; i++)
      for (let j = i + 1; j < pool.length - 1; j++)
        for (let k = j + 1; k < pool.length; k++)
          combos.push([pool[i], pool[j], pool[k]]);
    return combos;
  })();

  return (
    <div className="max-w-2xl space-y-6">
      {/* Alertas */}
      <div className="card space-y-4">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-halo-subtle">Alertas de contenido</h2>
        <Range label="Días sin publicar → Alerta" value={config.dias_alerta} min={1} max={14} accent="accent-amber-400" onChange={(v) => set("dias_alerta", v)} />
        <Range label="Días sin publicar → Crítico" value={config.dias_critico} min={1} max={21} accent="accent-red-400" onChange={(v) => set("dias_critico", v)} />
        <Range label="Mínimo vídeos / mes" value={config.min_videos_mes} min={1} max={30} accent="accent-halo-accent" onChange={(v) => set("min_videos_mes", v)} />
        <Range label="Objetivo vídeos / semana" value={config.objetivo_videos_semana} min={1} max={20} accent="accent-halo-accent" onChange={(v) => set("objetivo_videos_semana", v)} />
      </div>

      {/* Agencia */}
      <div className="card space-y-4">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-halo-subtle">Agencia</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="block"><span className="mb-1.5 block text-sm text-halo-text">Nombre</span><input className="input-base" value={config.agencia_nombre} onChange={(e) => set("agencia_nombre", e.target.value)} /></label>
          <label className="block"><span className="mb-1.5 block text-sm text-halo-text">Moneda</span><select className="input-base" value={config.moneda} onChange={(e) => set("moneda", e.target.value)}><option value="EUR">EUR €</option><option value="USD">USD $</option><option value="GBP">GBP £</option></select></label>
        </div>
      </div>

      {/* Estrategia Instagram */}
      <div className="card space-y-5">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-halo-subtle">Estrategia Instagram</h2>

        {/* Hashtags */}
        <div>
          <p className="mb-2 text-xs font-medium text-halo-text">Pool de hashtags (5 fijos — se rotan 3 por vídeo)</p>
          <div className="grid grid-cols-5 gap-2">
            {[0,1,2,3,4].map((i) => (
              <input
                key={i}
                className="input-base text-xs"
                value={config.hashtags[i] ?? ""}
                onChange={(e) => setHashtag(i, e.target.value)}
                placeholder={`hashtag ${i+1}`}
              />
            ))}
          </div>
          {hashtagCombinations.length > 0 && (
            <p className="mt-1.5 text-[10px] text-halo-subtle">
              {hashtagCombinations.length} combinaciones disponibles · ejemplo próximo vídeo: #{hashtagCombinations[0].join(" #")}
            </p>
          )}
        </div>

        {/* Días de publicación */}
        <div>
          <p className="mb-2 text-xs font-medium text-halo-text">Días de publicación</p>
          <div className="flex gap-2 flex-wrap">
            {DIAS_SEMANA.map((label, day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  config.posting_days.includes(day)
                    ? "bg-halo-accent text-white"
                    : "border border-halo-border bg-halo-surface text-halo-subtle hover:text-halo-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Horarios */}
        <div>
          <p className="mb-2 text-xs font-medium text-halo-text">Horarios de publicación</p>
          <div className="flex gap-2 items-center flex-wrap">
            {config.posting_times.map((t, i) => (
              <input
                key={i}
                type="time"
                value={t}
                onChange={(e) => setTime(i, e.target.value)}
                className="input-base w-28 text-sm"
              />
            ))}
            {config.posting_times.length < 3 && (
              <button
                type="button"
                onClick={() => set("posting_times", [...config.posting_times, "12:00"])}
                className="btn-secondary px-3 py-1 text-xs"
              >
                + Horario
              </button>
            )}
            {config.posting_times.length > 1 && (
              <button
                type="button"
                onClick={() => set("posting_times", config.posting_times.slice(0, -1))}
                className="text-xs text-red-400 hover:text-red-300"
              >
                − quitar último
              </button>
            )}
          </div>
        </div>

        {/* Posts por día */}
        <Range
          label="Posts por día de publicación"
          value={config.posts_per_day}
          min={1}
          max={3}
          accent="accent-halo-accent"
          onChange={(v) => set("posts_per_day", v)}
        />

        <div className="rounded-lg border border-halo-border/60 bg-halo-bg/50 p-2.5 text-[11px] text-halo-subtle">
          Con esta configuración: <span className="text-halo-text font-medium">{config.posting_days.length * config.posts_per_day} vídeos/semana</span> · Los horarios se asignan automáticamente al aprobar (cuando Pubbler esté activo)
        </div>
      </div>

      {/* Pubbler */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-halo-subtle">Pubbler</h2>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${config.pubbler_api_key ? "bg-green-900/40 text-green-400" : "bg-zinc-800 text-halo-subtle"}`}>
            {config.pubbler_api_key ? "✓ Activo" : "Sin configurar"}
          </span>
        </div>
        <p className="text-xs text-halo-subtle">Cuando actives el plan de Pubbler, añade la API key aquí y la programación será automática al aprobar un vídeo.</p>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs text-halo-text">API Key de Pubbler</span>
            <input
              className="input-base font-mono text-xs"
              type="password"
              placeholder="pb_live_xxxxxxxxxxxx"
              value={config.pubbler_api_key}
              onChange={(e) => set("pubbler_api_key", e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-halo-text">Workspace ID (en Pubbler → Configuración)</span>
            <input
              className="input-base font-mono text-xs"
              placeholder="ws_xxxx"
              value={config.pubbler_workspace_id}
              onChange={(e) => set("pubbler_workspace_id", e.target.value)}
            />
          </label>
        </div>
        <div className="rounded-lg border border-halo-border/60 bg-halo-bg/50 p-2.5 text-[11px] text-halo-subtle space-y-1">
          <p>Sin API key: al aprobar un vídeo puedes descargarlo y subirlo tú manualmente.</p>
          <p>Con API key: al aprobar, el sistema calcula el siguiente slot libre según la estrategia y lo programa en Pubbler automáticamente.</p>
        </div>
      </div>

      {/* Notificaciones */}
      <div className="card">
        <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-halo-subtle">Notificaciones</h2>
        <label className="flex cursor-pointer items-center gap-3">
          <button type="button" onClick={() => set("notif_telegram", !config.notif_telegram)} className={`relative h-5 w-10 rounded-full transition-colors ${config.notif_telegram ? "bg-halo-accent" : "bg-halo-muted"}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${config.notif_telegram ? "translate-x-1" : "-translate-x-4"}`} />
          </button>
          <span className="text-sm text-halo-text">Notificaciones Telegram</span>
        </label>
      </div>

      {/* Bot Telegram */}
      <div className="card space-y-4">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-halo-subtle">Bot de Telegram (opcional)</h2>
        <p className="text-xs text-halo-subtle">Solo si quieres que las modelos envíen vídeos por Telegram además del portal. El portal ya cubre todo sin necesidad del bot.</p>
        <div className="flex gap-2 flex-wrap">
          <button onClick={checkTelegramWebhook} disabled={telegramLoading} className="btn-secondary px-4 py-2 text-sm disabled:opacity-40">
            {telegramLoading ? "Consultando..." : "📡 Ver estado webhook"}
          </button>
          {appUrl && (
            <button onClick={setupTelegramWebhook} disabled={telegramLoading} className="btn-primary px-4 py-2 text-sm disabled:opacity-40">
              ⚡ Registrar webhook
            </button>
          )}
        </div>
        {telegramStatus && (
          <div className="rounded-lg border border-halo-border bg-halo-bg p-3 text-xs space-y-1 font-mono">
            <p className={telegramStatus.ok ? "text-green-400" : "text-red-400"}>
              {telegramStatus.ok ? "✓ Webhook activo" : "✗ Sin webhook configurado"}
            </p>
            {telegramStatus.result?.url && <p className="text-halo-subtle">URL: {telegramStatus.result.url}</p>}
            {telegramStatus.result?.last_error_message && <p className="text-amber-400">Último error: {telegramStatus.result.last_error_message}</p>}
            {!telegramStatus.ok && telegramStatus.error && <p className="text-red-400">{telegramStatus.error}</p>}
          </div>
        )}
        {telegramDone && <p className="text-xs text-green-400">✓ Webhook registrado. Las modelos ya pueden enviar vídeos al bot.</p>}
      </div>

      {/* R2 */}
      <div className="card space-y-4">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-halo-subtle">Administración R2</h2>
        <p className="text-xs text-halo-subtle">Importar vídeos ya existentes en R2 que no están registrados en la base de datos.</p>
        <div className="flex gap-2 flex-wrap">
          <button onClick={checkR2} disabled={importLoading} className="btn-secondary px-4 py-2 text-sm disabled:opacity-40">
            {importLoading ? "Consultando..." : "🔍 Ver archivos sin importar"}
          </button>
          {importStatus && importStatus.missing_count > 0 && (
            <button onClick={importR2} disabled={importLoading} className="btn-primary px-4 py-2 text-sm disabled:opacity-40">
              ↑ Importar {importStatus.missing_count} archivo{importStatus.missing_count !== 1 ? "s" : ""}
            </button>
          )}
        </div>
        {importStatus && (
          <div className="rounded-lg border border-halo-border bg-halo-bg p-3 text-xs space-y-1">
            <p className="text-halo-subtle">R2: {importStatus.total_r2} · Importados: {importStatus.already_imported} · Sin importar: <span className={importStatus.missing_count > 0 ? "text-amber-400 font-semibold" : "text-green-400"}>{importStatus.missing_count}</span></p>
            {importStatus.missing_keys.length > 0 && (
              <ul className="mt-2 max-h-40 overflow-y-auto space-y-0.5 font-mono text-[10px] text-halo-subtle">
                {importStatus.missing_keys.map((key: string) => <li key={key}>{key}</li>)}
              </ul>
            )}
          </div>
        )}
        {importDone && <p className="text-xs text-green-400">✓ {importDone.imported} archivo{importDone.imported !== 1 ? "s" : ""} importado{importDone.imported !== 1 ? "s" : ""} correctamente.</p>}
      </div>

      <button onClick={save} className="btn-primary px-6 py-2 text-sm">{saved ? "Guardado ✓" : "Guardar ajustes"}</button>
    </div>
  );
}

function Range({ label, value, min, max, accent, onChange }: { label: string; value: number; min: number; max: number; accent: string; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-halo-text">{label}</span>
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} className={`flex-1 ${accent}`} />
        <span className="w-8 text-right font-mono text-sm text-halo-accent">{value}</span>
      </div>
    </label>
  );
}

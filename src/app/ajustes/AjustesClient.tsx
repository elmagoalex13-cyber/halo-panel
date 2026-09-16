"use client";

import { useEffect, useState } from "react";

interface Config {
  notif_telegram: boolean;
  pubbler_workspace_id: string;
  pubbler_api_key: string;
}

const DEFAULTS: Config = {
  notif_telegram: true,
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

  return (
    <div className="max-w-2xl space-y-6">
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

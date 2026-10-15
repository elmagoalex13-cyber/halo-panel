"use client";

import { useRef, useState } from "react";

export type FotoSubida = { nombre: string; at: string; vista: string | null };

function put(url: string, file: File, contentType: string, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => reject(new Error("Se cortó la conexión. Prueba otra vez."));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`La subida falló (${xhr.status})`)));
    xhr.send(file);
  });
}

/** Subir (o cambiar) la foto de perfil o la del banner: se sube tal cual, sin recomprimir. */
export function SubirFotoPerfil({ tipo, actual, onSubida }: { tipo: "perfil" | "banner"; actual: FotoSubida | null; onSubida: (f: FotoSubida) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const etiqueta = tipo === "perfil" ? "foto de perfil" : "foto del banner";

  async function subir(file: File) {
    setError(null);
    setProgreso(0);
    try {
      const contentType = file.type || "image/jpeg";
      const pre = await fetch("/api/portal/fotos-perfil/presign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, filename: file.name, contentType, size: file.size }) });
      const p = (await pre.json().catch(() => ({}))) as { error?: string; key?: string; url?: string; contentType?: string };
      if (!pre.ok || !p.key || !p.url) throw new Error(p.error ?? "No se pudo preparar la subida");
      await put(p.url, file, p.contentType ?? contentType, setProgreso);
      const reg = await fetch("/api/portal/fotos-perfil/registrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, key: p.key, nombre: file.name, size: file.size, mime: contentType }) });
      const r = (await reg.json().catch(() => ({}))) as { error?: string; vista?: string | null };
      if (!reg.ok) throw new Error(r.error ?? "No se pudo guardar la foto");
      onSubida({ nombre: file.name, at: new Date().toISOString(), vista: r.vista ?? null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la foto");
    } finally {
      setProgreso(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-[#8B5CF6]/30 bg-[#8B5CF6]/[0.08] p-3">
      {actual ? (
        <div className="flex items-center gap-3">
          {actual.vista ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={actual.vista} alt={`Tu ${etiqueta}`} className="h-16 w-16 shrink-0 rounded-lg object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
          ) : null}
          <p className="min-w-0 text-sm text-emerald-300">
            ✓ Ya la hemos recibido
            <span className="block truncate text-xs text-white/45">{actual.nombre}</span>
          </p>
        </div>
      ) : (
        <p className="text-sm text-white/70">Aún no has subido tu {etiqueta}.</p>
      )}
      <input ref={input} type="file" accept="image/*,.heic,.heif" className="hidden" onChange={(e) => e.target.files?.[0] && void subir(e.target.files[0])} />
      <button
        type="button"
        disabled={progreso !== null}
        onClick={() => input.current?.click()}
        className="flex min-h-11 w-full items-center justify-center rounded-xl bg-[#8B5CF6] px-4 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:opacity-60"
      >
        {progreso !== null ? `Subiendo… ${progreso}%` : actual ? `Cambiar mi ${etiqueta}` : `Subir mi ${etiqueta}`}
      </button>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

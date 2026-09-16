export function cn(...inputs: Array<string | false | null | undefined>) {
  return inputs.filter(Boolean).join(" ");
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string | null | undefined, options?: Intl.DateTimeFormatOptions | string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  if (typeof options === "string") {
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: options.includes("yy") ? "2-digit" : undefined,
    });
  }

  return date.toLocaleDateString("es-ES", options ?? { day: "2-digit", month: "short", year: "numeric" });
}

export function formatRelative(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));

  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 MB";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function tipoVideoLabel(tipo: string) {
  const labels: Record<string, string> = {
    tipo1: "Tipo 1",
    tipo2: "Tipo 2",
    tipo3: "Tipo 3",
    tipo4: "Tipo 4 — Referencia",
    sin_clasificar: "Sin clasificar",
  };
  return labels[tipo] ?? tipo;
}

export function estadoLabel(estado: string) {
  const labels: Record<string, string> = {
    recibido: "Recibido",
    clasificando: "Clasificando",
    en_reparto: "En reparto",
    editando: "Editando",
    en_aprobacion: "En aprobacion",
    aprobado: "Aprobado",
    publicado: "Publicado",
    rechazado: "Rechazado",
    archivado: "Archivado",
    pendiente: "Pendiente",
    cobrado: "Cobrado",
    atrasado: "Atrasado",
  };
  return labels[estado] ?? estado;
}

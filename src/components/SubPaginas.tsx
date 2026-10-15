import Link from "next/link";

export type SubPagina = { href: string; label: string; activa: boolean; badge?: number };

/** Barra de subpaginas (pestañas con enlace) bajo el titulo de una seccion: asi el menu lateral no se llena de entradas. */
export function SubPaginas({ items }: { items: SubPagina[] }) {
  return (
    <div className="mb-6 flex gap-2 overflow-x-auto border-b border-white/[0.08] [scrollbar-width:none]">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`flex shrink-0 items-center gap-2 px-4 py-2.5 text-sm font-semibold transition ${
            i.activa ? "border-b-2 border-[#8B5CF6] text-white" : "text-[color:var(--text-secondary)] hover:text-white"
          }`}
        >
          {i.label}
          {i.badge ? <span className="rounded-full bg-pink-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{i.badge}</span> : null}
        </Link>
      ))}
    </div>
  );
}

/** OnlyFans: contenido de las modelos, posts por programar y banco de captions. */
export const subOnlyFans = (activa: "contenido" | "programar" | "captions"): SubPagina[] => [
  { href: "/onlyfans", label: "Contenido", activa: activa === "contenido" },
  { href: "/posts-of", label: "Por programar", activa: activa === "programar" },
  { href: "/captions", label: "Captions", activa: activa === "captions" },
];

/** Instagram: sus pestañas y, como subpagina mas, asignar videos. */
export const subInstagram = (activa: "cuentas" | "referencias" | "ideas" | "propios" | "historias" | "asignar", historiasNuevas = 0): SubPagina[] => [
  { href: "/instagram?tab=cuentas", label: "Cuentas", activa: activa === "cuentas" },
  { href: "/instagram?tab=referencias", label: "Cuentas de referencia", activa: activa === "referencias" },
  { href: "/instagram?tab=ideas", label: "Ideas virales", activa: activa === "ideas" },
  { href: "/instagram?tab=propios", label: "Virales propios", activa: activa === "propios" },
  { href: "/instagram?tab=historias", label: "Historias", activa: activa === "historias", badge: historiasNuevas },
  { href: "/asignar", label: "Asignar vídeos", activa: activa === "asignar" },
];

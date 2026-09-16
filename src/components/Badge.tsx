import type { EstadoCobro, VideoEstado } from "@/types";
import { cn } from "@/lib/utils";

const estadoClass: Record<VideoEstado | EstadoCobro, string> = {
  recibido: "badge-recibido",
  clasificando: "badge-clasificando",
  en_reparto: "badge-clasificando",
  editando: "badge-editando",
  en_aprobacion: "badge-aprobacion",
  aprobado: "badge-aprobado",
  publicado: "badge-aprobado",
  rechazado: "badge-rechazado",
  archivado: "badge-rechazado",
  pendiente: "badge-clasificando",
  cobrado: "badge-aprobado",
  atrasado: "badge-rechazado",
};

const labels: Record<string, string> = {
  recibido: "Recibido",
  clasificando: "Clasificando",
  en_reparto: "En reparto",
  editando: "Editando",
  en_aprobacion: "Aprobacion",
  aprobado: "Aprobado",
  publicado: "Publicado",
  rechazado: "Rechazado",
  archivado: "Archivado",
  pendiente: "Pendiente",
  cobrado: "Cobrado",
  atrasado: "Atrasado",
};

export function Badge({
  status,
  children,
  className,
}: {
  status: VideoEstado | EstadoCobro;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", estadoClass[status], className)}>
      {children ?? labels[status]}
    </span>
  );
}

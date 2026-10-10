import { notFound } from "next/navigation";
import { canUseSupabase, createAdminClient } from "@/lib/supabase/server";
import { ContratoPublico } from "./ContratoPublico";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Tu contrato · Halo Models",
  description: "Léelo con calma y fírmalo desde el móvil.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Tu contrato con Halo Models",
    description: "Léelo con calma y fírmalo desde el móvil.",
    siteName: "Halo Models",
    images: [{ url: "/halo-logo.png", width: 800, height: 800, alt: "Halo Models Agency" }],
    type: "website",
  },
  twitter: { card: "summary", title: "Tu contrato con Halo Models", description: "Léelo con calma y fírmalo desde el móvil.", images: ["/halo-logo.png"] },
};

// PUBLICO: la modelo llega desde el email. Lee la explicacion, ve el contrato con sus datos y lo firma.
export default async function ContratoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!canUseSupabase()) notFound();
  const db = createAdminClient();
  const { data: c } = await db.from("contratos_modelos").select("id, nombre, email, fecha_inicio, firma_agencia, estado, firmado_at").eq("token", token).maybeSingle();
  if (!c || c.estado === "cancelado") notFound();

  // Primera vez que abre el enlace: queda marcado como visto (para saber si lo ha leido)
  if (c.estado === "enviado") await db.from("contratos_modelos").update({ estado: "visto", visto_at: new Date().toISOString() }).eq("id", c.id).eq("estado", "enviado");

  return (
    <ContratoPublico
      token={token}
      nombre={c.nombre as string}
      fechaInicio={c.fecha_inicio as string}
      firmaAgencia={(c.firma_agencia as string | null) ?? null}
      firmado={c.estado === "firmado"}
      firmadoAt={(c.firmado_at as string | null) ?? null}
    />
  );
}

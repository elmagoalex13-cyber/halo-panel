import { Metadata } from "next";
import { PortalClient } from "./PortalClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mis pendientes · Halo" };

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PortalClient token={token} />;
}

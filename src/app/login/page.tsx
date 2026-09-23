import { adminAuthConfigured } from "@/lib/adminAuth";
import { LoginClient } from "./LoginClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acceso admin" };

export default function LoginPage() {
  return <LoginClient configured={adminAuthConfigured()} />;
}

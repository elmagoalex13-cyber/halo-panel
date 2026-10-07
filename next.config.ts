import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Secciones eliminadas: ya no existen en el panel
  async redirects() {
    return ["biblioteca", "reparto", "calendario", "metricas"].map((p) => ({ source: `/${p}`, destination: "/dashboard", permanent: false }));
  },
  // Cabeceras de seguridad: el panel no se puede incrustar en otra web, y el navegador no adivina tipos de archivo
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  outputFileTracingRoot: process.cwd(),
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
};

export default nextConfig;

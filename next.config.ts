import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Secciones eliminadas: ya no existen en el panel
  async redirects() {
    return ["biblioteca", "reparto", "calendario", "metricas"].map((p) => ({ source: `/${p}`, destination: "/dashboard", permanent: false }));
  },
  outputFileTracingRoot: process.cwd(),
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
};

export default nextConfig;

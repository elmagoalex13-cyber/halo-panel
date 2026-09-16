/**
 * PM2 Ecosystem — HALO Runner
 *
 * Despliegue en Ionos:
 *   cd /opt/halo-runner
 *   cp .env.example .env   # rellenar valores reales
 *   npm install
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup
 */
module.exports = {
  apps: [
    {
      name: "halo-runner",
      script: "src/index.mjs",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
      // Logs
      out_file: "/var/log/halo-runner/out.log",
      error_file: "/var/log/halo-runner/err.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      // Reinicio exponencial en errores: 1s → 2s → 4s … hasta 30s
      exp_backoff_restart_delay: 1000,
    },
  ],
};

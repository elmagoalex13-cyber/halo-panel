export function canUseMetricool() {
  return Boolean(process.env.METRICOOL_API_KEY && process.env.METRICOOL_USER_ID);
}

// Estructura lista para cuando haya API key de Metricool.
// Referencia: https://api.metricool.com — GET /v2/analytics/instagram para stats por blogId.
export async function fetchMetricoolAccountStats(blogId: string) {
  if (!canUseMetricool()) {
    throw new Error("Metricool no esta configurado (falta METRICOOL_API_KEY o METRICOOL_USER_ID).");
  }
  throw new Error(`Integracion con Metricool pendiente de implementar (blogId=${blogId}).`);
}

export type VideoEstado =
  | "recibido"
  | "clasificando"
  | "en_reparto"
  | "editando"
  | "en_aprobacion"
  | "aprobado"
  | "publicado"
  | "rechazado"
  | "archivado";

export type TipoVideo = "tipo1" | "tipo2" | "tipo3" | "tipo4" | "sin_clasificar";
export type VaultCategoria = "of_credentials" | "banco" | "telegram" | "api_key" | "social" | "otro";
export type EstadoCobro = "pendiente" | "cobrado" | "atrasado";

export type Modelo = {
  id: string;
  nombre: string;
  nombre_real?: string | null;
  email?: string | null;
  telefono?: string | null;
  activa: boolean;
  fecha_alta: string;
  notas?: string | null;
  avatar_url?: string | null;
  instagram?: string[];
  porcentaje_comision?: number | null;
  portal_token?: string | null;
  telegram_id?: string | null;
};

export type MetricoolEstado = "conectada" | "no_conectada" | "error";

export type CuentaInstagram = {
  id: string;
  modelo_id: string;
  modelo_nombre?: string;
  username: string;
  url?: string | null;
  activa: boolean;
  metricool_blog_id?: string | null;
  metricool_estado?: MetricoolEstado;
};

export type EstadoCuentaIG = "activa" | "sin_revisar" | "pausada";

export type ReelIG = {
  id: string;
  thumbnail_url: string;
  visitas: number;
  fecha: string;
  es_trial: boolean;
};

export type DemografiaTramo = { rango: string; pct: number };
export type DemografiaCiudad = { ciudad: string; pct: number };

export type Demografia = {
  pct_mujeres: number;
  pct_hombres: number;
  tramos: DemografiaTramo[];
  ciudades: DemografiaCiudad[];
  fecha: string;
};

export type CuentaIGDemo = {
  id: string;
  username: string;
  modelo_nombre: string;
  avatar_url?: string | null;
  tag?: string | null;
  publicaciones: number;
  seguidores: number;
  seguidos: number;
  bio: string[];
  ganancia_hoy: number;
  ganancia_7d: number;
  ganancia_30d: number;
  ganancia_90d: number;
  estado: EstadoCuentaIG;
  ultimo_reel: string;
  reels: ReelIG[];
  reels_30d_count: number;
  reels_7d_count: number;
  mediana_visitas: number;
  demografia: Demografia;
  metricool_estado?: MetricoolEstado;
};

export type ReferenciaCuenta = {
  id: string;
  username: string;
  categoria?: string | null;
  notas?: string | null;
  activa: boolean;
  favorita?: boolean;
  ultimo_scrape_at?: string | null;
  intervalo_dias: number;
  created_at: string;
};

export type EstadoTriaje = "pendiente" | "confirmado" | "descartado";

export type ReferenciaVideo = {
  id: string;
  cuenta_id: string;
  cuenta_username?: string;
  video_url?: string | null;
  thumbnail_url?: string | null;
  descripcion?: string | null;
  visitas: number;
  likes?: number | null;
  fecha_publicacion?: string | null;
  lo_que_pone?: string | null;
  palabras_voz?: number | null;
  mira_camara?: boolean | null;
  frase_detectada?: string | null;
  sin_formato_marcado?: boolean | null;
  tags?: string[];
  formato_propuesto?: string | null;
  formato_confirmado?: string | null;
  estado_triaje?: EstadoTriaje;
  confirmado_at?: string | null;
  cuenta_categoria?: string | null;
  layout_json?: unknown | null;
};

export type LibraryContent = {
  id: string;
  modelo_id: string;
  modelo_nombre: string;
  r2_key: string;
  r2_bucket: string;
  filename_original: string;
  mimetype: string;
  size_bytes: number;
  duracion_seg: number;
  tipo_video: TipoVideo;
  estado: VideoEstado;
  notas_editor?: string | null;
  rechazo_motivo?: string | null;
  drive_url?: string | null;
  recibido_at: string;
  aprobado_at?: string | null;
  signed_url?: string;
};

export type FacturacionModelo = {
  id: string;
  modelo_id: string;
  modelo_nombre: string;
  periodo_inicio: string;
  periodo_fin: string;
  ingresos_brutos: number;
  porcentaje_comision: number;
  comision_agencia: number;
  neto_modelo: number;
  estado_cobro: EstadoCobro;
  fecha_cobro?: string | null;
};

export type CreatorConfig = {
  modelo_id: string;
  persona_name?: string | null;
  age?: number | null;
  origin?: string | null;
  lives_in_country?: string | null;
  lives_in_city?: string | null;
  timezone?: string | null;
  primary_language?: string | null;
  other_languages?: string[];
  regional_flavor?: string | null;
  archetype?: string | null;
  capitalization?: string | null;
  unique_details?: string | null;
  persona_lore?: string | null;
  account_context?: string | null;
  physical_description?: string | null;
  hard_limits?: string[];
  other_limits?: string | null;
  topic_limits?: string | null;
  custom_pricing_enabled?: boolean;
  photo_min_price?: number | null;
  video_min_price?: number | null;
  video_price_per_minute?: number | null;
  optional_details?: string | null;
  updated_at?: string | null;
};

export type BancoReferenciaVideo = {
  id: string;
  cuenta_referencia_id: string | null;
  cuenta_username?: string | null;
  url_referencia: string | null;
  thumbnail_url?: string | null;
  frase: string | null;
  cancion_nombre?: string | null;
  cancion_artista?: string | null;
  views_referencia: number | null;
  likes_referencia: number | null;
  fecha_publicacion_ref?: string | null;
  origen?: string | null;
  created_at?: string | null;
};

export type VaultEntry = {
  id: string;
  nombre: string;
  categoria: VaultCategoria;
  descripcion?: string | null;
  modelo_id?: string | null;
  created_at: string;
};

export type LandingEventType = "pageview" | "click";

export type Landing = {
  id: string;
  nombre: string;
  slug: string;
  public_url: string;
  landing_key: string;
  activa: boolean;
  created_at: string;
  updated_at?: string | null;
};

export type LandingEvent = {
  id: string;
  landing_id: string;
  landing_slug: string;
  event_type: LandingEventType;
  label?: string | null;
  destination?: string | null;
  session_id: string;
  referrer?: string | null;
  page?: string | null;
  url?: string | null;
  user_agent?: string | null;
  occurred_at: string;
  created_at: string;
};

export type LandingStats = Landing & {
  visitas_totales: number;
  visitantes_unicos: number;
  clicks_onlyfans: number;
  conversion_rate: number;
  ultima_actividad?: string | null;
};

export type LeadEstado = "nuevo" | "contactado" | "captado" | "futuro" | "descartado" | "eliminado";

export type Lead = {
  id: string;
  estado: LeadEstado;
  nombre?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  pais?: string | null;
  experiencia?: string | null;
  ingresos?: string | null;
  necesidades: string[];
  otro_mensaje?: string | null;
  acepta_privacidad: boolean;
  origen: string;
  landing_slug?: string | null;
  page_url?: string | null;
  referrer?: string | null;
  user_agent?: string | null;
  notas?: string | null;
  ultimo_contacto_at?: string | null;
  seguimiento_at?: string | null;
  captado_at?: string | null;
  descartado_at?: string | null;
  eliminado_at?: string | null;
  created_at: string;
  updated_at?: string | null;
};

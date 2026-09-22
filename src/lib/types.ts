export interface Gpt {
  id: string;
  name: string;
  description: string | null;
  category: string;
  icon_url: string | null;
  author: string | null;
  tools_enabled: { file_search: boolean; code_interpreter: boolean };
  vision_enabled: boolean;
  conversation_starters: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export type GptUsage30d = {
  unique_users: number;
  message_count: number;
  total_cost: number;
};

export interface GptWithAssistantId extends Gpt {
  openai_assistant_id: string | null; // legacy (Assistants API)
  system_prompt?: string;
  model?: string;
  // Cuántas conversaciones de miembros tiene este GPT. Solo lo llena el listado
  // de admin (GET /api/admin/gpts) — se usa para advertir antes de borrar, ya
  // que threads.gpt_id tiene ON DELETE CASCADE y se llevaría todas por delante.
  thread_count?: number;
  // Uso de los últimos 30 días (admin_usage_summary). null = el RPC no respondió;
  // no es lo mismo que ceros reales.
  usage_30d?: GptUsage30d | null;
}

export interface AllowedMember {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  tier: string | null;
  ltv: number | null;
  price: number | null;
  recurring_interval: string | null;
  joined_date: string | null;
  invited_by: string | null;
  source: "manual" | "skool_csv" | "skool_webhook";
  added_at: string;
  monthly_message_limit: number | null;
  // Promoción a admin diferida: se aplica sola en el primer login (trigger
  // handle_new_user), porque `profiles.is_admin` no existe hasta entonces.
  pending_admin?: boolean;
  // Derivado en GET /api/admin/members, no es columna: ¿ya tiene fila en
  // `profiles`? Es la señal de que logró entrar al menos una vez.
  has_logged_in?: boolean;
}

export interface AuthEvent {
  id: string;
  email: string | null;
  event: string;
  provider: string | null;
  reason: string | null;
  ip: string | null;
  created_at: string;
}

export interface AppSettings {
  community_name: string;
  logo_url: string | null;
  skool_url: string | null;
  support_email: string | null;
  default_monthly_message_limit: number | null;
}

export interface WebhookEvent {
  id: string;
  source: string;
  email: string | null;
  action: string | null;
  success: boolean;
  error: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  is_admin: boolean;
  created_at: string;
}

export interface Thread {
  id: string;
  user_id: string;
  gpt_id: string;
  openai_thread_id: string | null; // legacy (Assistants API)
  openai_conversation_id: string | null;
  // Huella de la API key con la que se verificó openai_conversation_id.
  // NULL o distinta de la actual = pendiente de comprobar (ver conversation-sync).
  conversation_key_fingerprint: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

// Carpeta para agrupar conversaciones en el sidebar. Solo agrupa: no tiene
// instrucciones ni archivos propios (ver 20260906130000_projects.sql).
export interface Project {
  id: string;
  name: string;
  /** Contexto compartido por los chats de la carpeta. null = solo agrupa. */
  instructions: string | null;
  created_at: string;
  updated_at: string;
}

// Resumen de conversación para el sidebar (cross-GPT)
export interface ThreadSummary {
  id: string;
  title: string;
  gpt_id: string;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_preview?: string;
}

export interface UploadedFile {
  name: string;
  openai_file_id: string;
  type: "image" | "document" | "video" | "audio";
  /** Identidad estable del tile: la segunda foto no remonta la primera. */
  clientId?: string;
  /** Todavía viajando a Storage; el composer ya muestra preview. */
  pending?: boolean;
  previewUrl?: string; // Miniatura: object URL de imagen/poster, o URL firmada del archivo
  /** Object URL del video/audio original para el preview 64px. */
  mediaUrl?: string;
  /** Duración del video en segundos, si el navegador pudo leerla al adjuntar. */
  durationSeconds?: number;
  /**
   * El video ya está adjunto pero Gemini todavía no llenó la transcripción.
   * El composer se puede usar; enviar espera a que baje.
   */
  analyzing?: boolean;
  /**
   * Número con el que se rotuló este archivo para el modelo ("imagen 3"),
   * guardado al mandarlo. Tiene que viajar hasta el cliente: si la interfaz lo
   * recalcula por su cuenta, muestra un número distinto del que escuchó el
   * modelo. Ausente en lo subido en esta sesión (todavía no se mandó) y en lo
   * anterior a que se empezara a guardar.
   */
  n?: number;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  files?: UploadedFile[];
  // Presente cuando el streaming se cortó (red, fallo de OpenAI) antes de
  // terminar. `content` conserva lo que ya se alcanzó a generar — nunca se
  // reemplaza por el error, para no perder texto que el usuario ya leyó.
  error?: string;
}

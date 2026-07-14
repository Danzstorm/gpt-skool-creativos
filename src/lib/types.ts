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

export interface GptWithAssistantId extends Gpt {
  openai_assistant_id: string | null; // legacy (Assistants API)
  system_prompt?: string;
  model?: string;
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

export type Theme = "creativo" | "dark" | "light";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  is_admin: boolean;
  theme: Theme;
  created_at: string;
}

export interface Thread {
  id: string;
  user_id: string;
  gpt_id: string;
  openai_thread_id: string | null; // legacy (Assistants API)
  openai_conversation_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

// Resumen de conversación para el sidebar (cross-GPT)
export interface ThreadSummary {
  id: string;
  title: string;
  gpt_id: string;
  created_at: string;
  updated_at: string;
  last_message_preview?: string;
}

export interface UploadedFile {
  name: string;
  openai_file_id: string;
  type: "image" | "document";
  previewUrl?: string; // URL local (object URL) para vista previa de imágenes en la sesión
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  files?: UploadedFile[];
}

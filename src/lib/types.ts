export interface Gpt {
  id: string;
  name: string;
  description: string | null;
  category: string;
  icon_url: string | null;
  tools_enabled: { file_search: boolean; code_interpreter: boolean };
  vision_enabled: boolean;
  conversation_starters: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface GptWithAssistantId extends Gpt {
  openai_assistant_id: string;
}

export interface AllowedMember {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  added_at: string;
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
  openai_thread_id: string;
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
}

export interface UploadedFile {
  name: string;
  openai_file_id: string;
  type: "image" | "document";
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  files?: UploadedFile[];
}

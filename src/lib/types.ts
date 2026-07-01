export interface Gpt {
  id: string;
  name: string;
  description: string | null;
  category: string;
  icon_url: string | null;
  tools_enabled: { file_search: boolean; code_interpreter: boolean };
  vision_enabled: boolean;
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
  created_at: string;
}

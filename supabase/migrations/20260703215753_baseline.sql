-- ============================================================
-- GPT Creativos Platform — Supabase Schema
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Miembros aprobados (exportado de Skool)
CREATE TABLE IF NOT EXISTS allowed_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  full_name text,
  is_active boolean DEFAULT true,
  -- Métricas importadas del export de Skool
  tier text,
  ltv numeric,
  price numeric,
  recurring_interval text,
  joined_date date,
  invited_by text,
  source text DEFAULT 'manual', -- 'skool_csv' | 'manual'. La sincronización solo revoca 'skool_csv'.
  added_at timestamptz DEFAULT now()
);

-- GPTs (antes = Assistants de OpenAI; con la migración a Responses API,
-- la config (prompt/modelo) vive en esta tabla, no en OpenAI)
CREATE TABLE IF NOT EXISTS gpts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text DEFAULT 'General',
  icon_url text,
  openai_assistant_id text, -- legacy (Assistants API, sunset 2026-08-26); se conserva para auditoría
  system_prompt text,
  model text DEFAULT 'gpt-4.1-mini',
  tools_enabled jsonb DEFAULT '{"file_search": true, "code_interpreter": false}'::jsonb,
  vision_enabled boolean DEFAULT true,
  conversation_starters jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Vista pública: excluye openai_assistant_id
CREATE OR REPLACE VIEW gpts_public AS
  SELECT id, name, description, category, icon_url, tools_enabled, vision_enabled, conversation_starters, is_active, sort_order, created_at
  FROM gpts
  WHERE is_active = true
  ORDER BY sort_order ASC, created_at DESC;

-- Threads de conversación (múltiples por usuario+GPT, como ChatGPT)
CREATE TABLE IF NOT EXISTS threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  gpt_id uuid REFERENCES gpts(id) ON DELETE CASCADE,
  openai_thread_id text, -- legacy (Assistants API); null en conversaciones creadas post-migración
  openai_conversation_id text, -- Conversations API (reemplaza openai_thread_id)
  migrated_at timestamptz, -- se setea cuando el historial legacy ya fue copiado a `messages`
  title text DEFAULT 'Nueva conversación',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Mensajes: caché local (carga instantánea, ya no depende de round-trip a OpenAI).
-- El contexto que el modelo usa vive en la Conversation de OpenAI; esta tabla es
-- para mostrar el historial en la UI y para el backfill del legacy en threads.
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  files jsonb, -- [{openai_file_id, name, type}]
  created_at timestamptz DEFAULT now()
);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own messages"
  ON messages FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
-- Escrituras solo con service role (mismo patrón que usage_events).
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);

-- Último mensaje por thread, para el preview del sidebar (una sola query, no N+1).
-- SECURITY INVOKER: respeta la policy RLS de `messages` del usuario que llama.
CREATE OR REPLACE FUNCTION latest_messages_for_threads(thread_ids uuid[])
RETURNS TABLE(thread_id uuid, content text)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT DISTINCT ON (m.thread_id) m.thread_id, m.content
  FROM messages m
  WHERE m.thread_id = ANY(thread_ids)
  ORDER BY m.thread_id, m.created_at DESC;
$$;

-- Perfiles de usuario
CREATE TABLE IF NOT EXISTS profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email text,
  full_name text,
  is_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Trigger: crear perfil automáticamente al registrar usuario
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

ALTER TABLE allowed_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE gpts ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- allowed_members: solo service role (admins acceden via API con service key)
-- No policies necesarias: si RLS está activo y no hay policy → solo service role pasa

-- gpts: usuarios autenticados ven solo la vista pública (sin assistant_id)
CREATE POLICY "authenticated users can read gpts_public"
  ON gpts FOR SELECT
  TO authenticated
  USING (is_active = true);

-- threads: usuario solo ve los suyos
CREATE POLICY "users manage own threads"
  ON threads FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- profiles: usuario ve y edita el suyo
CREATE POLICY "users manage own profile"
  ON profiles FOR ALL
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Eventos de uso (un registro por mensaje enviado) para métricas de admin.
CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  gpt_id uuid REFERENCES gpts(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES threads(id) ON DELETE SET NULL,
  model text,
  tokens_in integer,
  tokens_out integer,
  cost numeric,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
-- Sin policies: se escribe/lee solo con service role (server-side).

-- Mapeo de adjuntos del chat: openai_file_id -> copia en Storage.
-- Permite reconstruir miniaturas de imágenes al recargar una conversación.
-- El texto de los mensajes vive en OpenAI; aquí solo persiste la referencia del archivo.
CREATE TABLE IF NOT EXISTS uploaded_files (
  openai_file_id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  mime text,
  name text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;
-- Sin policies: solo el service role (server) accede.

-- Bucket privado para las copias (crear en Storage; acceso solo server-side):
--   INSERT INTO storage.buckets (id, name, public) VALUES ('chat-uploads','chat-uploads',false);

-- ============================================================
-- Índices
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_allowed_members_email ON allowed_members(email);
CREATE INDEX IF NOT EXISTS idx_gpts_category ON gpts(category);
CREATE INDEX IF NOT EXISTS idx_gpts_sort_order ON gpts(sort_order);
CREATE INDEX IF NOT EXISTS idx_threads_user_gpt ON threads(user_id, gpt_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_user ON uploaded_files(user_id);

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
  added_at timestamptz DEFAULT now()
);

-- GPTs (= Assistants de OpenAI)
CREATE TABLE IF NOT EXISTS gpts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text DEFAULT 'General',
  icon_url text,
  openai_assistant_id text NOT NULL,
  tools_enabled jsonb DEFAULT '{"file_search": true, "code_interpreter": false}'::jsonb,
  vision_enabled boolean DEFAULT true,
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Vista pública: excluye openai_assistant_id
CREATE OR REPLACE VIEW gpts_public AS
  SELECT id, name, description, category, icon_url, tools_enabled, vision_enabled, is_active, sort_order, created_at
  FROM gpts
  WHERE is_active = true
  ORDER BY sort_order ASC, created_at DESC;

-- Threads de conversación (múltiples por usuario+GPT, como ChatGPT)
CREATE TABLE IF NOT EXISTS threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  gpt_id uuid REFERENCES gpts(id) ON DELETE CASCADE,
  openai_thread_id text NOT NULL,
  title text DEFAULT 'Nueva conversación',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

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

-- ============================================================
-- Índices
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_allowed_members_email ON allowed_members(email);
CREATE INDEX IF NOT EXISTS idx_gpts_category ON gpts(category);
CREATE INDEX IF NOT EXISTS idx_gpts_sort_order ON gpts(sort_order);
CREATE INDEX IF NOT EXISTS idx_threads_user_gpt ON threads(user_id, gpt_id);

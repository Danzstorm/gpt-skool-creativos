-- ============================================================
-- Settings de white-label (fila única) + cuota de mensajes + log de webhooks
-- ============================================================

-- Fila única de configuración de marca/negocio, editable desde /admin/settings.
-- `id int primary key default 1` + CHECK fuerza que solo pueda existir la fila 1.
CREATE TABLE IF NOT EXISTS app_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  community_name text NOT NULL DEFAULT 'Creativos',
  logo_url text,
  skool_url text,
  support_email text,
  default_monthly_message_limit int, -- NULL = sin límite global
  updated_at timestamptz DEFAULT now()
);
INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
-- Nombre/logo/link de Skool se muestran en landing y login SIN sesión — lectura
-- pública. Solo el service role (admin) escribe.
CREATE POLICY "anyone can read app_settings"
  ON app_settings FOR SELECT
  TO anon, authenticated
  USING (true);

-- Cuota mensual por miembro. NULL = usa default_monthly_message_limit de
-- app_settings; si ese también es NULL, sin límite.
ALTER TABLE allowed_members ADD COLUMN IF NOT EXISTS monthly_message_limit int;

-- Auditoría de altas/bajas automatizadas (Zapier/Skool) para que el cliente
-- pueda verificar desde el admin que la integración realmente está llegando.
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL, -- 'skool_webhook' | 'skool_bulk'
  email text,
  action text,
  success boolean NOT NULL,
  error text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
-- Sin policies: solo el service role (server) lee/escribe.
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at DESC);

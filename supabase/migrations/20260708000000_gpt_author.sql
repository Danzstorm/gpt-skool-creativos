-- Autor visible del GPT (empty state / catálogo), estilo "By {author}".
ALTER TABLE gpts ADD COLUMN IF NOT EXISTS author text;

-- Postgres no permite insertar una columna en medio de una vista existente
-- con CREATE OR REPLACE (solo agregar al final); por eso `author` va al final.
CREATE OR REPLACE VIEW gpts_public AS
  SELECT id, name, description, category, icon_url, tools_enabled, vision_enabled, conversation_starters, is_active, sort_order, created_at, author
  FROM gpts
  WHERE is_active = true
  ORDER BY sort_order ASC, created_at DESC;

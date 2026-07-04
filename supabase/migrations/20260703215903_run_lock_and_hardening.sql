-- Lock por-thread: evita 2 respuestas concurrentes sobre la misma conversación
-- (2 pestañas, doble click, reintento de red). 'streaming' se libera al terminar
-- el run o se considera expirado tras 2 minutos (por si el servidor murió a mitad).
ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT now();

-- updated_at automático (antes se seteaba a mano en cada ruta que tocaba threads).
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;
DROP TRIGGER IF EXISTS set_threads_updated_at ON threads;
CREATE TRIGGER set_threads_updated_at
  BEFORE UPDATE ON threads
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- Índices: sidebar ordena por updated_at desc; dashboard admin filtra/agrupa por fecha y GPT.
CREATE INDEX IF NOT EXISTS idx_threads_user_updated ON threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_gpt_created ON usage_events(gpt_id, created_at);

-- Agregado SQL para el dashboard de admin: reemplaza la descarga de hasta 20k
-- filas de usage_events a JS por un GROUP BY en la base de datos.
CREATE OR REPLACE FUNCTION admin_usage_summary(since timestamptz, until timestamptz)
RETURNS TABLE(
  gpt_id uuid,
  gpt_name text,
  message_count bigint,
  tokens_in bigint,
  tokens_out bigint,
  total_cost numeric,
  unique_users bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    u.gpt_id,
    g.name,
    count(*),
    coalesce(sum(u.tokens_in), 0),
    coalesce(sum(u.tokens_out), 0),
    coalesce(sum(u.cost), 0),
    count(DISTINCT u.user_id)
  FROM usage_events u
  LEFT JOIN gpts g ON g.id = u.gpt_id
  WHERE u.created_at >= since AND u.created_at < until
  GROUP BY u.gpt_id, g.name
  ORDER BY count(*) DESC;
$$;

CREATE OR REPLACE FUNCTION admin_top_users(since timestamptz, until timestamptz, result_limit int DEFAULT 10)
RETURNS TABLE(
  user_id uuid,
  email text,
  message_count bigint,
  total_cost numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    u.user_id,
    p.email,
    count(*),
    coalesce(sum(u.cost), 0)
  FROM usage_events u
  LEFT JOIN profiles p ON p.id = u.user_id
  WHERE u.created_at >= since AND u.created_at < until
  GROUP BY u.user_id, p.email
  ORDER BY count(*) DESC
  LIMIT result_limit;
$$;

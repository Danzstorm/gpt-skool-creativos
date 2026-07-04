-- Extiende admin_top_users con conteos distintos de GPTs/threads (paridad con
-- el cálculo anterior en JS) y agrega admin_stats_summary para las tarjetas de
-- totales (mensajes/costo/usuarios activos) sin depender del top 15.

DROP FUNCTION IF EXISTS admin_top_users(timestamptz, timestamptz, int);

CREATE OR REPLACE FUNCTION admin_top_users(since timestamptz, until timestamptz, result_limit int DEFAULT 15)
RETURNS TABLE(
  user_id uuid,
  email text,
  message_count bigint,
  gpt_count bigint,
  thread_count bigint,
  total_cost numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    u.user_id,
    p.email,
    count(*),
    count(DISTINCT u.gpt_id),
    count(DISTINCT u.thread_id),
    coalesce(sum(u.cost), 0)
  FROM usage_events u
  LEFT JOIN profiles p ON p.id = u.user_id
  WHERE u.created_at >= since AND u.created_at < until
  GROUP BY u.user_id, p.email
  ORDER BY count(*) DESC
  LIMIT result_limit;
$$;

CREATE OR REPLACE FUNCTION admin_stats_summary(since timestamptz, until timestamptz)
RETURNS TABLE(message_count bigint, total_cost numeric, active_users bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*), coalesce(sum(cost), 0), count(DISTINCT user_id)
  FROM usage_events
  WHERE created_at >= since AND created_at < until;
$$;

-- Serie diaria del Resumen del admin, sumada en SQL.
--
-- Antes el panel traía cada usage_event y cada thread del período de a 500
-- filas (unas 21 idas y vueltas seguidas para 30 días) y sumaba por día en
-- Vercel. Eso hacía lento entrar a /admin y gastaba CPU de funciones.
--
-- `tz` es la zona horaria del servidor que arma los días del gráfico, así las
-- claves de día coinciden con enumerateDays().
--
-- SECURITY INVOKER como el resto de las RPC de admin (ver 20260903182147): el
-- único llamante es el service_role del panel.
create or replace function public.admin_daily_series(since timestamptz, until timestamptz, tz text)
returns table (day date, messages bigint, active_users bigint, cost numeric, new_threads bigint)
language sql stable security invoker set search_path = public as $$
  with usage_by_day as (
    select
      (u.created_at at time zone tz)::date as day,
      count(*) as messages,
      count(distinct u.user_id) as active_users,
      coalesce(sum(u.cost), 0) as cost
    from usage_events u
    where u.created_at >= since
      and u.created_at < until
    group by 1
  ),
  threads_by_day as (
    select (t.created_at at time zone tz)::date as day, count(*) as new_threads
    from threads t
    where t.created_at >= since
      and t.created_at < until
    group by 1
  )
  select
    coalesce(u.day, t.day),
    coalesce(u.messages, 0),
    coalesce(u.active_users, 0),
    coalesce(u.cost, 0),
    coalesce(t.new_threads, 0)
  from usage_by_day u
  full join threads_by_day t on t.day = u.day
  order by 1;
$$;

revoke execute on function public.admin_daily_series(timestamptz, timestamptz, text) from public, anon, authenticated;

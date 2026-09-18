-- Embudo de altas para el panel de admin: cuántas personas entraron a Skool
-- (alta por Zapier), cuántas de ellas ya abrieron la web y cuántas ya chatearon.
--
-- Zapier avisa que alguien PAGÓ en Skool, no que usa la plataforma. Sin este
-- cruce el admin veía las altas en la actividad de integración pero no tenía
-- forma de saber si esa gente llegó a entrar.
--
-- Fuentes:
--   * webhook_events (source skool_webhook, action add, success): cada alta que
--     mandó Zapier. Se agrupa por email porque un re-ingreso vuelve a disparar.
--   * profiles.created_at: primer ingreso real a la web (el perfil lo crea el
--     trigger handle_new_user en el primer login). No se usa auth_events porque
--     se purga a los 90 días y el "primer login" de alguien antiguo se movería.
--   * usage_events: primer mensaje enviado.
--
-- SECURITY INVOKER a propósito (ver 20260903182147): el único llamante es el
-- service_role del panel; anon/authenticated no tienen SELECT sobre estas
-- tablas, así que la función no les sirve aunque alguien les devolviera EXECUTE.

-- `result_limit` NULL = todas las filas (lo usa el resumen de abajo). El panel
-- pide solo las que lista: con cientos de altas al mes, traerlas todas para
-- contarlas en JS chocaría con el tope de 1000 filas de PostgREST.
drop function if exists public.admin_skool_signups(timestamptz, timestamptz);
create or replace function public.admin_skool_signups(since timestamptz, until timestamptz, result_limit int default null)
returns table (
  email text,
  full_name text,
  joined_at timestamptz,
  first_login_at timestamptz,
  first_message_at timestamptz
)
language sql stable security invoker set search_path = public as $$
  with adds as (
    select w.email, min(w.created_at) as joined_at
    from webhook_events w
    where w.source = 'skool_webhook'
      and w.action = 'add'
      and w.success
      and w.created_at >= since
      and w.created_at < until
    group by w.email
  )
  select
    a.email,
    m.full_name,
    a.joined_at,
    p.created_at,
    (select min(u.created_at) from usage_events u where u.user_id = p.id)
  from adds a
  left join allowed_members m on m.email = a.email
  left join profiles p on lower(p.email) = a.email
  order by a.joined_at desc
  limit result_limit;
$$;

-- Los tres números del embudo, contados en SQL para que no dependan de cuántas
-- filas devuelve la lista.
create or replace function public.admin_skool_signups_summary(since timestamptz, until timestamptz)
returns table (joined_skool bigint, entered_web bigint, used_chat bigint)
language sql stable security invoker set search_path = public as $$
  select count(*), count(first_login_at), count(first_message_at)
  from admin_skool_signups(since, until, null);
$$;

-- Primeros ingresos a la web en el período, de cualquier miembro (también los
-- importados por CSV hace meses que recién ahora prueban la plataforma). El join
-- con allowed_members descarta a quien autenticó con Google sin ser miembro:
-- el trigger le crea perfil igual, pero el gate no lo dejó pasar.
create or replace function public.admin_first_web_logins(since timestamptz, until timestamptz)
returns bigint
language sql stable security invoker set search_path = public as $$
  select count(*)
  from profiles p
  join allowed_members m on m.email = lower(p.email)
  where p.created_at >= since
    and p.created_at < until;
$$;

revoke execute on function public.admin_skool_signups(timestamptz, timestamptz, int) from public, anon, authenticated;
revoke execute on function public.admin_skool_signups_summary(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.admin_first_web_logins(timestamptz, timestamptz) from public, anon, authenticated;

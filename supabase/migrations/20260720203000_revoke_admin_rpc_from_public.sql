-- FUGA DE DATOS: las funciones admin_* son SECURITY DEFINER, no verifican
-- is_admin por dentro, y tenían EXECUTE para PUBLIC/anon/authenticated. Como
-- PostgREST las expone en /rest/v1/rpc/ y la anon key es pública (va en el
-- bundle del navegador), cualquiera desde internet y SIN sesión podía sacar
-- emails de miembros, uso y costos:
--
--   curl -X POST .../rest/v1/rpc/admin_top_users -H "apikey: <anon>" ...
--   -> [{"email":"...","message_count":16,"total_cost":0.049}, ...]
--
-- El dashboard admin las llama con service_role desde el servidor
-- (src/app/admin/page.tsx usa createServiceClient), que ignora estos GRANTs,
-- así que revocarlas no le quita nada a la app.
revoke execute on function public.admin_stats_summary(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.admin_top_users(timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.admin_usage_summary(timestamptz, timestamptz) from public, anon, authenticated;

-- Trigger sobre auth.users: lo invoca Postgres, nadie tiene por qué llamarlo
-- por RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Los locks de thread SÍ los llama el cliente autenticado (src/app/api/chat),
-- así que `authenticated` conserva el permiso; lo que sobra es el acceso
-- anónimo.
revoke execute on function public.acquire_thread_lock(uuid, interval) from public, anon;
revoke execute on function public.release_thread_lock(uuid) from public, anon;

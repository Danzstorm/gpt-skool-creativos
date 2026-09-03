-- Los tres RPC del panel de admin eran SECURITY DEFINER sin ninguna comprobación
-- del llamante: lo único que impedía que cualquiera con la anon key (que es
-- pública, va en el bundle) sacara emails de miembros, costos y uso era el
-- REVOKE de la migración 20260720183631.
--
-- Eso ya ocurrió una vez: hasta ese REVOKE, las tres funciones eran ejecutables
-- por PUBLIC desde internet. Y el REVOKE es frágil, porque un DROP FUNCTION +
-- CREATE devuelve los grants al valor por defecto (EXECUTE para PUBLIC) y nadie
-- se entera. Este proyecto ya hace DROP + CREATE sobre estas mismas funciones
-- (ver 20260704020421).
--
-- SECURITY INVOKER hace que la protección sea intrínseca en vez de depender de
-- un grant que hay que acordarse de mantener. Las tres solo leen usage_events,
-- profiles y gpts, así que no necesitan privilegios elevados:
--
--   * service_role (el ÚNICO llamante real: src/app/admin/page.tsx abre un
--     cliente service_role) salta RLS, así que el panel sigue viendo lo mismo.
--   * authenticated no tiene SELECT sobre usage_events, así que la llamada muere
--     con "permission denied for table usage_events" incluso si alguien le
--     devolviera el EXECUTE de la función.
--
-- Verificado contra esta misma base antes de aplicar, en una transacción
-- revertida: con INVOKER y el EXECUTE concedido a authenticated, la llamada
-- falla igual.
alter function public.admin_stats_summary(timestamptz, timestamptz) security invoker;
alter function public.admin_top_users(timestamptz, timestamptz, integer) security invoker;
alter function public.admin_usage_summary(timestamptz, timestamptz) security invoker;

-- ============================================================
-- Cierra hueco de privilegio: la política "users manage own profile" era
-- FOR ALL (incluye UPDATE) con USING/WITH CHECK (id = auth.uid()), así que
-- cualquier usuario autenticado podía hacer
--   supabase.from('profiles').update({ is_admin: true }).eq('id', user.id)
-- desde el navegador y autopromoverse a admin. Ningún código del cliente
-- escribe en `profiles` (solo lee), así que se reduce a SELECT-only; todo
-- write pasa por el service role desde rutas /api/admin/*.
-- ============================================================

DROP POLICY IF EXISTS "users manage own profile" ON profiles;

CREATE POLICY "users read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

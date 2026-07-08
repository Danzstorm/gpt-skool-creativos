-- ALTO: la policy "users manage own profile" (FOR ALL) permite a cualquier
-- usuario autenticado hacer UPDATE de su propia fila de profiles vía PostgREST,
-- incluyendo is_admin = true (auto-escalada de privilegios). El backend siempre
-- opera con service role, así que el UPDATE amplio nunca lo necesitó un cliente;
-- se restringe por privilegios de columna sin tocar la policy.
REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (full_name) ON profiles TO authenticated;

-- BAJO: gpts_public corre hoy como owner de la vista (bypassa RLS de `gpts`).
-- security_invoker hace que respete las policies de `gpts` en vez del filtro
-- WHERE is_active=true de la vista como única barrera.
--
-- OJO: `/` (landing pública, sin sesión) también lee gpts_public para mostrar
-- el catálogo a visitantes anónimos — comportamiento intencional que hay que
-- preservar. La policy existente solo cubre `authenticated`; se agrega la
-- equivalente para `anon` (mismo filtro is_active=true) antes de activar
-- security_invoker, para no romper la landing.
CREATE POLICY "anon can read active gpts"
  ON gpts FOR SELECT
  TO anon
  USING (is_active = true);

ALTER VIEW gpts_public SET (security_invoker = on);

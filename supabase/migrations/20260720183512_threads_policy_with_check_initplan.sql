-- Paso idempotente separado para coincidir con el historial de producción.
alter policy "users manage own threads" on public.threads
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

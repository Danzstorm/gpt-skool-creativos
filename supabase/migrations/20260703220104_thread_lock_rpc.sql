-- Adquirir/liberar el lock de un thread de forma atómica (evita condiciones de
-- carrera al construir el filtro a mano en JS). SECURITY DEFINER + chequeo de
-- user_id adentro: se puede llamar con el cliente user-scoped (respeta ownership
-- sin depender de RLS, que esta función bypassea).
CREATE OR REPLACE FUNCTION acquire_thread_lock(p_thread_id uuid, stale_after interval DEFAULT interval '2 minutes')
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE threads
  SET status = 'streaming', status_changed_at = now()
  WHERE id = p_thread_id
    AND user_id = auth.uid()
    AND (status = 'idle' OR status_changed_at < now() - stale_after);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION release_thread_lock(p_thread_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE threads SET status = 'idle' WHERE id = p_thread_id AND user_id = auth.uid();
$$;

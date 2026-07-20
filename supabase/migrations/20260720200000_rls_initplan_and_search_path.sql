-- Dos avisos del linter de Supabase, misma sesión de auditoría.

-- 1) `auth.uid()` suelto en un USING se re-evalúa POR FILA. Envolverlo en un
-- SELECT lo convierte en InitPlan: se calcula una vez por consulta. La condición
-- es idéntica, solo cambia el plan. Importa sobre todo en `messages`, que es la
-- tabla que más crece (una fila por mensaje de cada miembro).
alter policy "users read own messages" on public.messages
  using (user_id = (select auth.uid()));

-- `threads` es FOR ALL: hay que tocar USING y WITH CHECK. Un ALTER POLICY que
-- solo pasa USING deja el WITH CHECK con el auth.uid() suelto y el aviso sigue.
alter policy "users manage own threads" on public.threads
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "users read own profile" on public.profiles
  using (id = (select auth.uid()));

-- 2) Función sin `search_path` fijo. Es la misma clase de bug que tumbó el login
-- en julio (handle_new_user resolvía `profiles` contra un search_path sin
-- `public` y fallaba con 42P01). Acá el riesgo es menor porque no corre en
-- contexto GoTrue, pero se cierra igual: esquema explícito + search_path fijo.
create or replace function public.latest_messages_for_threads(thread_ids uuid[])
returns table(thread_id uuid, content text)
language sql
stable
set search_path = public
as $function$
  SELECT DISTINCT ON (m.thread_id) m.thread_id, m.content
  FROM public.messages m
  WHERE m.thread_id = ANY(thread_ids)
  ORDER BY m.thread_id, m.created_at DESC;
$function$;

-- 3) Claves foráneas sin índice de cobertura. Sin esto, borrar un usuario o un
-- thread obliga a un scan secuencial de la tabla hija.
create index if not exists idx_messages_user on public.messages (user_id);
create index if not exists idx_threads_gpt on public.threads (gpt_id);
create index if not exists idx_usage_events_thread on public.usage_events (thread_id);
create index if not exists idx_usage_events_user on public.usage_events (user_id);

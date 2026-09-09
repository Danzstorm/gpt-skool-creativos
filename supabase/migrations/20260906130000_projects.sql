-- Proyectos: carpetas para agrupar conversaciones en el sidebar.
--
-- Solo agrupación. No tienen instrucciones propias ni biblioteca de archivos
-- (decisión explícita del producto): la carpeta ordena la lista, el GPT sigue
-- siendo el único dueño del contexto de cada conversación. Por eso la tabla es
-- apenas un nombre — cualquier columna de más aquí es alcance que nadie pidió.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.projects enable row level security;

drop policy if exists "users manage own projects" on public.projects;

-- Mismo patrón que "users manage own threads": la fila es del usuario y punto.
-- `(select auth.uid())` en vez de `auth.uid()` suelto para que Postgres lo
-- resuelva una vez por consulta (InitPlan) y no por fila — ver
-- 20260720183454_rls_initplan_and_search_path.sql.
create policy "users manage own projects"
  on public.projects for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ON DELETE SET NULL, NUNCA CASCADE: borrar la carpeta no puede llevarse las
-- conversaciones de adentro. Un proyecto es una forma de ordenar la lista, no
-- un contenedor dueño de sus chats; si el borrado arrastrara los chats, un
-- click destinado a limpiar el sidebar borraría meses de historial sin que el
-- usuario lo pidiera. Al soltar el proyecto, sus chats vuelven a la lista suelta.
alter table public.threads
  add column if not exists project_id uuid references public.projects(id) on delete set null;

comment on column public.threads.project_id is
  'Proyecto (carpeta) que agrupa esta conversación. NULL = suelta en la lista de Chats. ON DELETE SET NULL: borrar el proyecto devuelve sus chats a la lista, no los borra.';

-- El sidebar lista los proyectos del usuario ordenados por actividad reciente.
create index if not exists idx_projects_user on public.projects (user_id, updated_at desc);

-- Parcial: la mayoría de las conversaciones no está en ningún proyecto, así que
-- indexar los NULL solo engorda el índice. Cubre además la FK, que sin índice
-- obliga a un scan de `threads` al borrar un proyecto.
create index if not exists idx_threads_project on public.threads (project_id)
  where project_id is not null;

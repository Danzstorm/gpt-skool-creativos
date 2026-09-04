-- Marca de ciclo de vida para los archivos subidos.
--
-- Hasta ahora, "borrable" se deducía de si algún mensaje referenciaba el
-- archivo. Eso era correcto mientras un archivo solo existía para ir pegado a
-- un mensaje: si no lo apuntaba ninguno, era basura de una subida abandonada.
--
-- Con la biblioteca del composer (`@`) esa deducción se rompe. Un archivo puede
-- estar perfectamente vivo y no tener ningún mensaje que lo apunte — porque la
-- persona borró esa conversación, o editó el mensaje. Seguir borrando por
-- alcanzabilidad significa perder de la biblioteca, y de forma irreversible en
-- tres sistemas a la vez (Storage, OpenAI y esta base), archivos que su dueño
-- espera encontrar.
--
-- `attached_at` guarda el hecho que de verdad importa: si este archivo llegó
-- alguna vez a mandarse. Los que nunca se mandaron siguen siendo basura
-- recolectable; los que sí, son biblioteca y no se tocan.
alter table public.uploaded_files
  add column if not exists attached_at timestamptz;

comment on column public.uploaded_files.attached_at is
  'Cuándo se adjuntó por primera vez a un mensaje. NULL = subido pero nunca enviado (recolectable). No NULL = biblioteca del usuario, no se borra por limpieza.';

-- Backfill: todo lo que hoy está referenciado por un mensaje ya es biblioteca.
-- Se usa created_at y no now() para no inventar una fecha de adjunto posterior
-- a la real.
update public.uploaded_files uf
set attached_at = coalesce(uf.created_at, now())
where uf.attached_at is null
  and (
    exists (
      select 1
      from public.message_attachments ma
      where ma.openai_file_id = uf.openai_file_id
    )
    or exists (
      select 1
      from public.messages m
      where m.files @> jsonb_build_array(
        jsonb_build_object('openai_file_id', uf.openai_file_id)
      )
    )
  );

-- La limpieza filtra por attached_at is null; sin índice sería un scan de toda
-- la tabla cada vez.
create index if not exists idx_uploaded_files_unattached
  on public.uploaded_files (created_at)
  where attached_at is null;

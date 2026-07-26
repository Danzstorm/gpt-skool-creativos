-- Paso idempotente separado para coincidir con el historial de producción.
-- La migración consolidada también fija este valor en entornos nuevos.
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-uploads', 'chat-uploads', false, 26214400)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit;

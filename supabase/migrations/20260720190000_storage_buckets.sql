-- Buckets de Storage.
--
-- Estaban creados a mano en el dashboard y no en migraciones, así que al montar
-- un proyecto nuevo desde este repo no existían: `gpt-icons` faltaba y la subida
-- de logos de GPT fallaba en silencio. Versionarlos evita que se repita.
--
-- Las subidas van con service_role (ver src/app/api/upload y .../gpts/icon), que
-- salta RLS, por eso no hacen falta policies sobre storage.objects.

-- Público: los logos se sirven por URL pública en la landing y el catálogo.
-- MIME restringido a mano con la misma lista que valida el endpoint; SVG queda
-- fuera a propósito (puede llevar scripts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gpt-icons',
  'gpt-icons',
  true,
  5242880, -- 5MB, igual que el límite del endpoint
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Privado: copias de los adjuntos del chat, se sirven con URL firmada para
-- reconstruir las miniaturas al recargar el historial.
insert into storage.buckets (id, name, public)
values ('chat-uploads', 'chat-uploads', false)
on conflict (id) do nothing;

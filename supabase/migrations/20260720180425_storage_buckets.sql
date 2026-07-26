-- Buckets de Storage (versión alineada con producción).
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
--
-- El navegador sube acá DIRECTO con URL firmada (ver /api/upload/sign), así que
-- el tamaño que declara el cliente al pedir la firma no es confiable: este
-- límite del bucket es el que de verdad lo hace cumplir. Tiene que coincidir
-- con MAX_SIZE_MB de src/lib/upload-limits.ts.
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-uploads', 'chat-uploads', false, 26214400) -- 25MB
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit;

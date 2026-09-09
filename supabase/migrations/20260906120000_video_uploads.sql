-- Soporte de adjuntos de video (cualquier GPT, sin flag por GPT — decisión
-- explícita del producto). El video nunca se sube a OpenAI: se describe con
-- Gemini (ver src/lib/gemini-upload.ts y /api/upload/register) y el modelo
-- recibe esa descripción como texto plano.

-- El navegador sube DIRECTO a Storage con URL firmada (ver /api/upload/sign);
-- el tamaño que declara el cliente no es confiable, así que el límite real es
-- el del bucket. 100MB para video, contra los 25MB de imágenes/documentos —
-- debe coincidir con MAX_VIDEO_SIZE_MB de src/lib/upload-limits.ts. Sube el
-- límite del BUCKET (compartido con imágenes/documentos): la validación por
-- tipo de archivo vive en rejectReason(), no en Storage.
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-uploads', 'chat-uploads', false, 104857600) -- 100MB
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit;

-- Texto que describió Gemini al procesar el video. Es lo único que el modelo
-- llega a "ver": el video en sí no se adjunta como archivo (Responses API no
-- lo entiende). NULL para cualquier fila que no sea un video.
alter table public.uploaded_files
  add column if not exists video_description text;

comment on column public.uploaded_files.video_description is
  'Descripción generada por Gemini a partir del video (solo filas con mime video/*). Es el texto que recibe el modelo en vez del archivo.';

-- El CHECK se creó sin nombre explícito en 20260726191712_harden_data_model_phase1.sql,
-- así que Postgres le puso el nombre por defecto <tabla>_<columna>_check.
alter table public.message_attachments
  drop constraint if exists message_attachments_kind_check;
alter table public.message_attachments
  add constraint message_attachments_kind_check check (kind in ('image', 'document', 'video'));

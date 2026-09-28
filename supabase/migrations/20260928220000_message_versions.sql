-- Versiones de respuesta: Regenerar ya no borra la respuesta anterior, la
-- desactiva. Las versiones de un turno son las filas de asistente entre dos
-- mensajes del usuario; solo una queda activa (la que ve el modelo).
alter table public.messages
  add column if not exists active boolean not null default true;

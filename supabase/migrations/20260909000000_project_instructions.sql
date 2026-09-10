-- Instrucciones de proyecto: contexto compartido por todos los chats de una
-- carpeta.
--
-- La migración que creó `projects` (20260906130000) dijo que las carpetas eran
-- solo agrupación, sin instrucciones propias. Esta reabre esa decisión a pedido
-- explícito: la carpeta pasa a llevar un texto que se antepone al system prompt
-- del GPT en cada turno de sus conversaciones. Sigue SIN biblioteca de archivos
-- propia — eso no se pidió y cada archivo compartido es una decisión de costo y
-- de permisos que hoy nadie necesita.
--
-- Es lo único que da contexto compartido sin romper el prompt caching de OpenAI:
-- el texto es fijo mientras nadie lo edite, así que el prefijo de `instructions`
-- se mantiene estable turno a turno. Un resumen de las conversaciones hermanas,
-- que cambia con cada mensaje, invalidaría ese caché en cada turno.

alter table public.projects
  add column if not exists instructions text;

-- Tope en la base, no solo en la ruta: este texto se cobra como tokens de
-- entrada en CADA mensaje de CADA chat de la carpeta, y la factura de OpenAI es
-- del cliente. Un texto sin techo es una fuga de dinero silenciosa que nadie ve
-- hasta el resumen de fin de mes. 2000 caracteres alcanzan para tono, público y
-- reglas de marca; un brief entero va adjunto en el chat que lo necesita.
do $$
begin
  alter table public.projects
    add constraint projects_instructions_length check (char_length(instructions) <= 2000);
exception
  when duplicate_object then null;
end $$;

comment on column public.projects.instructions is
  'Contexto compartido por los chats de la carpeta. Se manda como un turno de rol user, NUNCA en el canal de sistema. NULL o vacío = la carpeta solo agrupa.';

-- Huella del contexto ya aplicado a esta conversación.
--
-- El turno con el texto de la carpeta se manda una sola vez y queda guardado en
-- la Conversation de OpenAI. Sin esta marca habría que reenviarlo en cada
-- mensaje: el mismo texto duplicado N veces en el historial, cobrado de nuevo en
-- cada turno y para siempre. Con la huella se reinyecta solo cuando cambia el
-- texto, o cuando el chat entra o sale de una carpeta (NULL ↔ hash).
alter table public.threads
  add column if not exists project_context_fingerprint text;

comment on column public.threads.project_context_fingerprint is
  'Hash del texto de la carpeta que esta Conversation tiene AHORA. NULL = no tiene ninguno. Distinto del hash actual = hay que reemplazarlo.';

-- No hay columna con el id del turno a propósito. Los turnos de contexto se
-- reconocen dentro de la Conversation por su marca y se barren antes de crear el
-- nuevo, así que editar el texto lo reemplaza y sacar el chat de la carpeta lo
-- borra, sin que nadie tenga que recordar un id.
--
-- Guardarlo parecía más directo y era una trampa: si la escritura a Postgres
-- fallaba justo después de crear el turno en OpenAI, el id quedaba sin guardar,
-- el borrado por id no encontraba nada y cada turno siguiente agregaba otra
-- copia — para siempre, y pagándola. Buscar por marca hace la operación
-- idempotente y esa carrera deja de existir.

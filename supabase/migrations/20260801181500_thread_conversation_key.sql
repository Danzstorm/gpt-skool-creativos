-- ============================================================
-- Atar threads.openai_conversation_id a la API key que lo creó.
--
-- Las Conversations de OpenAI viven dentro de la cuenta dueña de la API key. Al
-- cambiar OPENAI_API_KEY a otra cuenta, todos los `conv_…` creados con la
-- anterior devuelven 404 y ninguna conversación existente puede continuarse,
-- aunque el historial siga intacto en Postgres y las imágenes en Storage.
--
-- Esta columna guarda una huella (sha256 truncado, no reversible) de la key con
-- la que se verificó el ID guardado:
--   igual a la huella actual -> utilizable; no se comprueba nada (coste cero).
--   distinta o NULL          -> la app comprueba la Conversation la próxima vez
--                               que se usa el thread y, si ya no existe, crea
--                               una nueva sembrada con el historial local
--                               (ver src/lib/conversation-sync.ts).
--
-- Se guarda la huella y no un booleano "migrado" a propósito: así una segunda
-- rotación de key vuelve a disparar la comprobación en vez de dar por buenas
-- Conversations de la cuenta anterior.
-- ============================================================

set lock_timeout = '5s';

-- Sin DEFAULT: las filas existentes quedan en NULL (pendientes de comprobar) y
-- la aplicación escribe la huella al crear o al verificar cada thread.
ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS conversation_key_fingerprint text;

COMMENT ON COLUMN threads.conversation_key_fingerprint IS
  'Huella (sha256 truncado) de la OPENAI_API_KEY con la que se verificó openai_conversation_id. NULL o distinta de la actual = pendiente de comprobar.';

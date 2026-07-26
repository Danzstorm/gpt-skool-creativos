-- Historial alineado con la versión aplicada en producción.
-- ============================================================
-- Auditoría de eventos de sesión (login, rechazo, cierre de sesión)
-- ============================================================

-- Tabla aparte de `webhook_events` a propósito: aquella audita la SINCRONIZACIÓN
-- de miembros (Zapier/CSV, unas pocas filas al día) y es la que el admin mira
-- para saber si la integración llega. Esta audita SESIONES (una fila por login,
-- cientos al día) y responde otra pregunta: "¿por qué se cerró la sesión de X?".
-- Mezclarlas enterraría los eventos de Zapier bajo el ruido de los logins.
--
-- Motivación concreta: un miembro fue expulsado y reconstruir el motivo exigió
-- leer logs crudos de GoTrue, y aun así un cierre de sesión quedó sin explicar.
-- Cada camino que corta una sesión escribe acá.
CREATE TABLE IF NOT EXISTS auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  -- Sin FK a auth.users: el usuario puede borrarse (limpieza de huérfanos) y el
  -- evento debe sobrevivir — si se borra el rastro, se pierde justo el caso que
  -- se quería poder explicar.
  user_id uuid,
  event text NOT NULL,
  provider text,  -- 'magiclink' | 'google' | null
  reason text,    -- detalle libre: mensaje de error crudo, email de la membresía, etc.
  ip text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Valores de `event`:
--   login_ok                       entró y pasó el gate de membresía
--   login_rejected_not_member      autenticó pero su email no está en allowed_members
--   login_rejected_revoked         autenticó pero su membresía está inactiva
--   login_rejected_email_mismatch  autenticó con un email distinto al de su membresía
--   callback_error                 falló el intercambio de código/token (link expirado, PKCE, etc.)
--   signout_user                   cerró sesión a mano (botón Salir)
--   signout_gate_revoked           el gate del proxy detectó revocación y cerró la sesión
--   session_expired                el cliente detectó SIGNED_OUT (refresh fallido / cookies borradas)

ALTER TABLE auth_events ENABLE ROW LEVEL SECURITY;
-- Sin policies: guarda emails e IPs, solo el service role escribe y solo /admin
-- (bajo requireAdmin) lee.

-- Consulta principal: la historia de una persona, más reciente primero.
CREATE INDEX IF NOT EXISTS idx_auth_events_email_created ON auth_events(email, created_at DESC);
-- Consulta secundaria: feed global del panel y purga por antigüedad.
CREATE INDEX IF NOT EXISTS idx_auth_events_created ON auth_events(created_at DESC);

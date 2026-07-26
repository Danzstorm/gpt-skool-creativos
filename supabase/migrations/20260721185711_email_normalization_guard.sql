-- Historial alineado con la versión aplicada en producción.
-- ============================================================
-- Garantía a nivel DB de que allowed_members.email está normalizado
-- ============================================================

-- Todo el código ya escribe en minúsculas (members-sync.ts, admins/route.ts,
-- webhooks), pero nada lo GARANTIZA. Una fila insertada a mano por SQL con
-- mayúsculas es invisible para el gate, que busca siempre por lower(): la
-- persona autentica bien, el gate no la encuentra, y la expulsa a /unauthorized
-- diciéndole que su membresía venció. Es el falso positivo más difícil de
-- diagnosticar que puede producir este sistema, porque la fila SÍ está y a
-- simple vista se ve correcta.

-- 1) Fusionar duplicados que solo difieren en mayúsculas/espacios. Sin esto, el
--    UPDATE de abajo violaría el UNIQUE de email. Se conserva la fila activa
--    (y entre varias, la más antigua) y se descartan las demás.
DELETE FROM allowed_members a
USING allowed_members b
WHERE lower(trim(a.email)) = lower(trim(b.email))
  AND a.id <> b.id
  AND (
    (COALESCE(b.is_active, false) AND NOT COALESCE(a.is_active, false))
    OR (
      COALESCE(a.is_active, false) = COALESCE(b.is_active, false)
      AND (b.added_at, b.id) < (a.added_at, a.id)
    )
  );

-- 2) Normalizar lo que quede.
UPDATE allowed_members
SET email = lower(trim(email))
WHERE email <> lower(trim(email));

-- 3) Impedir que vuelva a pasar. NOT VALID + VALIDATE en dos pasos: así el
--    ALTER no toma un lock fuerte sobre toda la tabla mientras verifica.
ALTER TABLE allowed_members
  DROP CONSTRAINT IF EXISTS allowed_members_email_lowercase;
ALTER TABLE allowed_members
  ADD CONSTRAINT allowed_members_email_lowercase
  CHECK (email = lower(trim(email))) NOT VALID;
ALTER TABLE allowed_members
  VALIDATE CONSTRAINT allowed_members_email_lowercase;

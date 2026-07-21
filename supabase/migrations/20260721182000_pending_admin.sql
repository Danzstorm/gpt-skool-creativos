-- ============================================================
-- Admin diferido: quedar admin automáticamente en el primer login
-- ============================================================

-- `profiles.is_admin` solo existe DESPUÉS del primer login (lo crea el trigger
-- de abajo). Por eso promover a alguien que nunca entró devolvía "pending" y la
-- UI le pedía al admin volver a agregarlo más tarde, a mano — un paso que se
-- olvida y deja al nuevo admin sin panel. Con este flag la promoción queda
-- registrada y se aplica sola cuando la persona entra.
ALTER TABLE allowed_members ADD COLUMN IF NOT EXISTS pending_admin boolean DEFAULT false;

-- CUIDADO al tocar esta función: corre dentro del INSERT de GoTrue en
-- auth.users, así que cualquier excepción se propaga como
-- "500: Database error saving new user" y tumba TODOS los logins de la
-- instancia (ya pasó una vez, ver 20260717212222). Por eso:
--   - se mantiene SET search_path = public (la causa de aquel incidente),
--   - la consulta a allowed_members va en un bloque con EXCEPTION propio: si
--     algo falla ahí, se pierde la promoción automática (recuperable desde el
--     panel) pero el usuario entra igual. Nunca al revés.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    text := lower(trim(NEW.email));
  v_is_admin boolean := false;
BEGIN
  BEGIN
    SELECT COALESCE(pending_admin, false)
      INTO v_is_admin
      FROM public.allowed_members
     WHERE email = v_email;

    v_is_admin := COALESCE(v_is_admin, false);

    -- El flag se consume: es una invitación de un solo uso, no un estado
    -- permanente. Quitar el admin después desde el panel no debe revertirse
    -- solo porque la persona vuelva a entrar.
    IF v_is_admin THEN
      UPDATE public.allowed_members
         SET pending_admin = false
       WHERE email = v_email;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;

  INSERT INTO public.profiles (id, email, full_name, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_is_admin
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Se mantiene la revocación de 20260720203000: nadie debe poder invocarla por RPC.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;

-- FIX: handle_new_user fallaba con "relation profiles does not exist" (SQLSTATE 42P01)
-- al crear un usuario nuevo. GoTrue ejecuta el trigger AFTER INSERT ON auth.users con
-- un search_path que NO incluye `public`, así que `INSERT INTO profiles` no resolvía la
-- tabla y tiraba "500: Database error saving new user" en /otp (magic link) y OAuth.
-- Se fija `search_path = public` y se califican los objetos con esquema.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

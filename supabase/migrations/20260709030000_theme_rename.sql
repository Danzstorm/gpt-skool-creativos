-- Renombra los temas a los nombres finales (Creativo / Dark / Light) y
-- agrega Light, que antes no existía. Pre-lanzamiento: no hay usuarios
-- reales todavía, así que el mapeo de datos existentes es solo por
-- prolijidad (nadie pierde su preferencia real).
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_theme_check;

UPDATE profiles SET theme = 'creativo' WHERE theme = 'violeta';
UPDATE profiles SET theme = 'dark' WHERE theme IN ('chatgpt', 'calido');

ALTER TABLE profiles ALTER COLUMN theme SET DEFAULT 'creativo';
ALTER TABLE profiles ADD CONSTRAINT profiles_theme_check
  CHECK (theme IN ('creativo', 'dark', 'light'));

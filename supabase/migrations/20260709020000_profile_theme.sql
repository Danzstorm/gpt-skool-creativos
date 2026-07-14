-- Preferencia de tema visual por usuario (chat). Vive en la cuenta, no en el
-- navegador, para que se mantenga al entrar desde otro dispositivo.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'violeta'
    CHECK (theme IN ('violeta', 'calido', 'chatgpt'));

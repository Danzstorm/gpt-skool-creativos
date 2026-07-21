# GPT Creativos

Plataforma web privada de GPTs para una comunidad de Skool. Cada miembro tiene su propio chat (estilo ChatGPT desktop) con acceso a los GPTs que el administrador publica. Acceso restringido a miembros de Skool mediante lista blanca.

**Stack:** Next.js 16 (App Router) · Supabase (Auth + Postgres + Storage) · OpenAI (Responses/Conversations API) · Tailwind 4 · Upstash Redis (rate limit, opcional).

> 📖 **Guía completa de operación y despliegue:** [`docs/GUIA-DE-USO.md`](docs/GUIA-DE-USO.md) — cubre uso, panel admin, Supabase, Google OAuth, Vercel, Zapier y SMTP paso a paso. Este README es el resumen.

---

## Requisitos (cuentas)

| Servicio | Para qué | ¿Obligatorio? |
|---|---|---|
| **Supabase** | Auth, base de datos, storage | Sí |
| **OpenAI** | Chat (se factura a esta cuenta) | Sí |
| **Vercel** | Hosting | Sí (plan **Pro** — las rutas de chat usan `maxDuration = 60`) |
| **Resend** (u otro SMTP) | Que el magic link llegue de verdad | Sí para lanzar — ver guía §7 |
| **Google Cloud** (OAuth) | Login con Google | Solo si se quiere; el magic link no lo necesita |
| **Zapier / Make** | Automatizar altas/bajas desde Skool | Recomendado |
| **Upstash Redis** | Rate limiting global en serverless | Recomendado, no bloqueante |

---

## Setup local

```bash
npm install
cp .env.example .env.local   # y rellena los valores
npm run dev                  # http://localhost:3000
```

Producción local (velocidad real):

```bash
npm run build && npm run start
```

> **Windows/Turbopack:** no corras `build` mientras `dev` está activo sobre la misma carpeta — comparten `.next/` y puede corromper la caché.

---

## Variables de entorno

Ver [`.env.example`](.env.example) para la lista completa con comentarios.

| Variable | Obligatoria | Nota |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Secreta — solo servidor |
| `OPENAI_API_KEY` | ✅ | |
| `NEXT_PUBLIC_SKOOL_URL` | ✅ | Link público del Skool |
| `SKOOL_WEBHOOK_SECRET` | ✅ | Secreto del webhook de altas/bajas |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | ➖ | Recomendado en prod |
| `NEXT_PUBLIC_SITE_URL` | ➖ | Dominio propio (canonical/OG) |

---

## Base de datos (Supabase)

El esquema vive en `supabase/migrations/` (fuente de verdad; `schema.sql` es un snapshot).

```bash
supabase link --project-ref <ref>
supabase db push
```

Luego crear los buckets de Storage: `gpt-icons` (público) y `chat-uploads` (privado). Detalle en la guía §5.

---

## Deploy en Vercel

1. **Importar el repo** en Vercel (New Project → seleccionar este repositorio de GitHub). Autodetecta Next.js; no requiere `vercel.json`.
2. Cargar **todas las env vars** (Production, y Preview si se prueba Zapier ahí).
3. Plan **Pro** (por `maxDuration = 60` en streaming — Hobby puede cortar respuestas).
4. Dominio propio → en Supabase Auth: actualizar **Site URL** y **Redirect URLs** al dominio real (si no, el magic link redirige mal).
5. Activar **Upstash Redis** (integración nativa de Vercel) y cargar sus dos vars.
6. Configurar **SMTP propio** (Resend) en Supabase Auth → Email — bloqueante para que el login funcione con usuarios reales.

Cada `git push` a la rama conectada dispara un redeploy automático.

---

## Post-deploy

1. **Primer admin** (una vez, no hace falta que haya entrado antes):
   ```bash
   node --env-file=.env.local scripts/bootstrap-admin.mjs admin@ejemplo.com
   ```
   Habilita el acceso y marca el admin. Hacerlo con `UPDATE profiles SET is_admin = true`
   a mano deja a esa persona sin fila en `allowed_members` y el gate la expulsa.
2. Entrar a `/admin/settings` → white-label (nombre de comunidad, logo, URL de Skool, email de soporte).
3. Crear los GPTs en `/admin/gpts` (nombre, system prompt, modelo, sugerencias, icono).
4. Cargar los miembros en `/admin/members` (import CSV de Skool) y conectar el webhook de Zapier.

Todo el detalle operativo está en [`docs/GUIA-DE-USO.md`](docs/GUIA-DE-USO.md).

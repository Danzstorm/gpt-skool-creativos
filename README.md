# GPT Creativos

Plataforma web privada de GPTs para una comunidad de Skool. Cada miembro tiene su propio chat (estilo ChatGPT desktop) con acceso a los GPTs que el administrador publica. Acceso restringido a miembros de Skool mediante lista blanca.

**Stack:** Next.js 16 (App Router) · Supabase (Auth + Postgres + Storage) · OpenAI (Responses/Conversations API) · Tailwind 4 · Upstash Redis (rate limit, opcional).

> 📖 **Guía completa de operación:** [`docs/GUIA-DE-USO.md`](docs/GUIA-DE-USO.md) — uso diario, panel admin, Zapier y SMTP paso a paso. Este README es el resumen técnico.

---

## Cómo funciona el acceso (léelo antes de tocar nada)

Es la parte que más confusión genera, así que en corto:

1. **`allowed_members` es la única fuente de verdad.** Si tu correo no está ahí y activo, no entras. No hay registro abierto.
2. **Hay dos formas de entrar**: enlace por correo (magic link) y Google. Ambas terminan en el mismo sitio y ambas pasan por el mismo filtro.
3. **El filtro corre en cada petición, no solo al entrar.** Si alguien se da de baja de Skool, pierde el acceso en menos de un minuto aunque tuviera la sesión abierta. Esto es a propósito.

> **Estar en la base de datos no es un pase permanente.** Es una confusión habitual: el acceso se comprueba continuamente contra `allowed_members`, no una sola vez al iniciar sesión.

**Con Google hay un detalle importante:** Google autentica *antes* de que podamos comprobar la membresía. Si entras con una cuenta de Google cuyo correo no es el que tienes en Skool, el sistema te lo dirá nombrando el correo correcto — pero no te dejará pasar. Usa la cuenta con el mismo correo, o entra por enlace al correo.

---

## "No puedo entrar" — cómo diagnosticarlo

Ve a **`/admin/members` → sección Accesos**. Ahí está registrado cada intento con su motivo. También puedes filtrar por persona con el icono de historial en su fila.

| Lo que ves en Accesos | Qué significa | Qué hacer |
|---|---|---|
| `Entró` | Todo bien | — |
| `No está en la lista` | Su correo no aparece en `allowed_members` | Añadirlo en `/admin/members`, o revisar que el import/Zapier llegó |
| `Revocado` | Está en la lista pero inactivo | Restaurar acceso desde `/admin/members` si corresponde |
| `Otro correo` | Entró con un Google distinto al de su membresía | Que use el correo de Skool, o añadir el suyo de Google a la lista |
| `Expulsado` | Tenía sesión y el filtro la cortó por baja | Es el comportamiento esperado tras una baja |
| `Error de enlace` | Enlace vencido, ya usado, o abierto en otro navegador | Que pida uno nuevo y lo abra en el mismo navegador |

En la fila de cada miembro, la etiqueta **"Nunca entró"** distingue a quien está invitado pero jamás inició sesión, de quien entra con normalidad. Sirve para saber si el problema es de acceso o de que nunca lo intentó.

Si la sección Accesos está **vacía pese a haber logins reales**, la auditoría no está escribiendo — eso sí es un fallo y hay que mirarlo, porque es lo único que permite depurar esto en producción.

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

Requiere Node ≥ 20.9.

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
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | ➖ | `"true"` solo si Google está configurado en Supabase; si no, el botón falla |
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

> ⚠️ **`handle_new_user()` es la función más delicada del esquema.** Corre dentro del alta de usuario de Supabase Auth, así que un error ahí no rompe "algo": rompe **todos los logins** con `Database error saving new user`. Ya pasó una vez (ver `20260717212222`). Si la tocas, pruébala antes contra una copia y verifica un login real justo después.

---

## Deploy

**Este proyecto no despliega por `git push`.** No hay integración de git en el proyecto de Vercel; se despliega con la CLI:

```bash
npx vercel --prod          # producción
npx vercel                 # preview (URL temporal, para probar antes)
```

Si prefieres deploy automático por push, hay que conectar el repositorio en el dashboard de Vercel primero. Mientras no se haga, un push **no publica nada**.

Configuración de la primera vez:

1. Cargar **todas las env vars** en Vercel (Production, y Preview si se prueba Zapier ahí).
2. Plan **Pro** (por `maxDuration = 60` en streaming — Hobby puede cortar respuestas).
3. Dominio propio → en Supabase **Auth → URL Configuration**: `Site URL` y `Redirect URLs` (`https://<dominio>/auth/callback`) apuntando al dominio real. Si no coinciden, el login falla sin más pista que un error genérico.
4. **SMTP propio** (Resend) en Supabase Auth → Email. Bloqueante: el SMTP por defecto manda 2 correos/hora, y como cada login es un correo, una comunidad de varios cientos lo agota en la primera hora.
5. Activar **Upstash Redis** (integración nativa de Vercel) y cargar sus dos vars.

> **Verificar el deploy con `curl` no sirve.** El dominio tiene protección anti-bot y devuelve `200` con una página de desafío, no tu sitio. Compruébalo en un navegador.

---

## Post-deploy

1. **Primer admin** (una vez; no hace falta que haya entrado antes):
   ```bash
   npm run admin:bootstrap -- admin@ejemplo.com
   ```
   Habilita el acceso **y** marca el admin. Si nunca ha entrado, queda admin solo en su primer login.

   > No uses `UPDATE profiles SET is_admin = true` a mano: marca el perfil pero no crea la fila en `allowed_members`, así que el filtro expulsa a esa persona. Queda "admin" en la base y sin poder entrar.
2. `/admin/settings` → white-label (nombre de comunidad, logo, URL de Skool, email de soporte) y administradores.
3. `/admin/gpts` → crear los GPTs (nombre, system prompt, modelo, sugerencias, icono).
4. `/admin/members` → importar el CSV de Skool y conectar el webhook de Zapier.

### Comprobación antes de invitar a nadie

Desde el dominio real, en un navegador:

| Prueba | Esperado |
|---|---|
| Enlace por correo con un correo **de la lista** | Llega el correo y entra a `/chat` |
| Enlace por correo con uno **que no está** | Mensaje de "no tienes acceso" + link a Skool, sin enviar correo |
| Abrir un enlace ya usado | `/login` avisa que venció — nunca una pantalla en blanco |

Después, esos tres intentos deben aparecer en **`/admin/members` → Accesos**.

---

## Scripts

Todos leen las credenciales de `.env.local`.

| Comando | Qué hace |
|---|---|
| `npm run admin:bootstrap -- <email>` | Da acceso y admin. Idempotente. |
| `npm run cleanup:orphans` | Borra archivos subidos que ya no referencia ningún mensaje. |
| `npm run cleanup:orphan-users` | Borra cuentas de quien autenticó sin ser miembro (sin conversaciones, >7 días). **Solo informa**; hay que pasar `-- --confirm` para borrar. |
| `npm run backfill:gpt-config` | Migración puntual de configuración de GPTs. |
| `npm run backfill:messages` | Migración puntual de mensajes de threads. |

---

## Repositorios

El proyecto tiene dos remotos configurados. Antes de empujar, confirma cuál corresponde:

```bash
git remote -v
```

---

Todo el detalle operativo está en [`docs/GUIA-DE-USO.md`](docs/GUIA-DE-USO.md).

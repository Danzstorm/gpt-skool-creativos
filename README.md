# GPT Creativos

Plataforma web privada de GPTs para una comunidad de Skool. Cada miembro tiene su propio chat (estilo ChatGPT desktop) con acceso a los GPTs que el administrador publica. Acceso restringido a miembros de Skool mediante lista blanca.

**Stack:** Next.js 16 (App Router) · Supabase (Auth + Postgres + Storage) · OpenAI (Responses/Conversations API) · Tailwind 4 · Upstash Redis (rate limit, opcional).

> 📖 **Guía completa de operación:** [`docs/GUIA-DE-USO.md`](docs/GUIA-DE-USO.md) — uso diario, panel admin, Zapier y SMTP paso a paso. Este README es el resumen técnico.

## Estado de producción

El endurecimiento del modelo de datos ya está aplicado en producción. Mantiene compatibilidad con usuarios y administradores existentes: no elimina tablas ni columnas, conserva RPC heredados durante el rollout y añade fallbacks para instancias antiguas.

La verificación confirmó 9 configuraciones privadas para 9 GPTs, 446 adjuntos normalizados, 7 constraints validados, cero relaciones huérfanas y prompts inaccesibles para usuarios anónimos. El despliegue se valida en CI con typecheck, lint, tests y build (`npm run verify`).

---

## Cómo funciona el acceso (léelo antes de tocar nada)

Es la parte que más confusión genera, así que en corto:

1. **`allowed_members` es la única fuente de verdad.** Si tu correo no está ahí y activo, no entras. No hay registro abierto.
2. **Solo se entra con Google.** El enlace por correo (magic link) se retiró: a mucha gente no le llegaba o lo abría en otro navegador y no funcionaba. El primer login con Google crea la cuenta; no hay un "registro" aparte.
3. **El filtro corre en cada petición, no solo al entrar.** Si alguien se da de baja de Skool, pierde el acceso en menos de un minuto aunque tuviera la sesión abierta. Esto es a propósito.

> **Estar en la base de datos no es un pase permanente.** Es una confusión habitual: el acceso se comprueba continuamente contra `allowed_members`, no una sola vez al iniciar sesión.

**Con Google hay un detalle importante:** Google autentica *antes* de que podamos comprobar la membresía. Si entras con una cuenta de Google cuyo correo no es el que tienes en Skool, el sistema te lo dirá nombrando el correo correcto — pero no te dejará pasar. El botón fuerza el selector de cuentas de Google en cada intento, así que basta con elegir la cuenta correcta. Si el correo de Skool no es de Google (ni Gmail ni Workspace), la salida es añadir su correo de Google a `allowed_members`.

**Dos cosas que Google no permite y que generan tickets:** iniciar sesión desde el navegador embebido de Instagram/Facebook/TikTok (error `403 disallowed_useragent`; el login lo detecta y pide abrir la página en Chrome/Safari), y terminar el flujo en un navegador distinto al que lo empezó.

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
| **Vercel** | Hosting | Sí. **Hobby alcanza**: con Fluid Compute activo el tope por función es 300s también en Hobby (verificado en el proyecto: `fluid: true`, `functionDefaultTimeout: 300`), que es lo que necesitan las rutas de chat. Pro solo hace falta si se quiere recuperar el auto-deploy por push (ver Deploy) |
| **Google Cloud** (OAuth) | Login con Google — la única forma de entrar | Sí |
| **Resend** (u otro SMTP) | Correos de Supabase Auth | Ya no: sin magic link, el login no manda correos |
| **Google AI Studio** (Gemini) | Describir los videos que se adjuntan (se factura a esta cuenta) | Solo si se quiere adjuntar video. Sin la key el resto del chat funciona igual — ver `GEMINI_API_KEY` más abajo |
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
| `GEMINI_API_KEY` | ➖ | Habilita adjuntar video ([AI Studio](https://aistudio.google.com/apikey); se factura a esa cuenta). Sin ella el botón `+` sigue ahí: el selector deja de listar videos y `/api/upload/sign` los rechaza antes de firmar. El resto del chat funciona igual. Ver guía §5 |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | ➖ | Recomendado en prod |
| `NEXT_PUBLIC_SITE_URL` | ➖ | Dominio propio (canonical/OG) |
| `STORAGE_QUOTA_GB` | ➖ | Techo del plan de Storage. Default **100** (Pro). Free 1 GB hay que setearlo. |
| `STORAGE_CLEAN_THRESHOLD_GB` | ➖ | Auto-limpieza solo sobre este uso medido. Default **80** (80% de Pro). |

---

## Base de datos (Supabase)

El esquema vive en `supabase/migrations/` (fuente de verdad; `schema.sql` es un snapshot).

```bash
supabase link --project-ref <ref>
supabase db push
```

Luego crear los buckets de Storage: `gpt-icons` (público) y `chat-uploads` (privado, **100MB**). Detalle en la guía §5.

> El límite de `chat-uploads` lo pone la migración `20260906120000`. Un bucket creado a mano *después* de `db push` se queda en el default y el video falla aunque `GEMINI_API_KEY` esté cargada — el síntoma no señala a Storage, así que conviene verificarlo al montar una instancia nueva.

> ⚠️ **`handle_new_user()` es la función más delicada del esquema.** Corre dentro del alta de usuario de Supabase Auth, así que un error ahí no rompe "algo": rompe **todos los logins** con `Database error saving new user`. Ya pasó una vez (ver `20260717212222`). Si la tocas, pruébala antes contra una copia y verifica un login real justo después.

La fase 1 añade `gpt_private_config` para separar prompts y configuración de ejecución del catálogo público, y `message_attachments` para relacionar archivos con mensajes mediante foreign keys. `messages.files` permanece como formato compatible para la UI. También se validan ownership compuesto, estados de thread, cuotas no negativas y unicidad de conversaciones OpenAI.

Para auditar una instancia sin imprimir PII, contenido ni prompts:

```bash
npm run audit:data-model
```

---

## Deploy

**Producción se despliega al hacer push a `master`, a través de GitHub Actions** (`.github/workflows/deploy.yml`), que primero corre typecheck, lint, tests y build.

No se despliega por la integración nativa de git de Vercel, y no puede: el team está en plan **Hobby** con un repositorio **privado**, así que Vercel bloquea todo deploy disparado por push porque el autor del commit no es contribuidor del proyecto — y Hobby no permite añadir miembros en repos privados. Todos los deploys `BLOCKED` del historial son eso, no fallos de build. El workflow lo esquiva desplegando desde un árbol desempaquetado con `git archive`, **sin `.git`**: sin metadata de git no hay autor que comprobar.

Por eso el repositorio está **desconectado** del proyecto de Vercel: la integración de git no podía desplegar y solo dejaba un deploy `BLOCKED` y una marca roja en cada push y cada PR.

Desconectar el repo NO afecta a los deploys por CLI ni al workflow: identifican el proyecto por `VERCEL_PROJECT_ID`/`VERCEL_ORG_ID` (o por `.vercel/project.json` en local), no por el enlace de git. El dominio de producción tampoco se mueve.

> Ojo, esto ya se intentó mal una vez: `gitProviderOptions.createDeployments: "disabled"` **no** sirve para esto. Ese ajuste controla los registros de Deployment que Vercel publica en GitHub, no si construye en cada push — con él en `disabled` los deploys se siguieron creando y bloqueando.

Para reconectarlo (por ejemplo si se pasa a Pro y se quiere el deploy nativo por push): **Vercel → Project Settings → Git → Connect Git Repository**.

El workflow necesita tres secrets de repositorio (**Settings → Secrets and variables → Actions**), que solo puede cargar un admin del repo:

| Secret | De dónde sale |
|---|---|
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens, con scope del team `creativos-skool` |
| `VERCEL_ORG_ID` | `.vercel/project.json` (campo `orgId`) |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` (campo `projectId`) |

Mientras falte `VERCEL_TOKEN`, el workflow omite el despliegue con un aviso en vez de fallar.

Despliegue manual, equivalente y sin pasar por GitHub:

```bash
npm run deploy:prod                    # verify + deploy a producción
npm run deploy:prod -- --skip-verify   # si ya corriste verify
```

Requiere `VERCEL_TOKEN` en el entorno. Despliega **HEAD**, no el árbol de trabajo, y aborta si hay cambios sin commitear.

### Revertir

Vercel guarda todos los deploys anteriores:

```bash
vercel rollback <url-del-deploy-anterior> --scope creativos-skool
vercel ls gpt-creativos --scope creativos-skool   # para encontrar la URL
```

El alias de producción se mueve solo. Ojo: **el rollback no revierte migraciones de base de datos** — son forward-only y no tienen `down`, así que el esquema tiene que seguir sirviendo a la versión anterior del código.

### Orden con las migraciones

Las migraciones se aplican a mano (`supabase db push`) y el código se despliega solo, así que pueden desincronizarse. Regla: **migraciones primero, código después.** Como no hay `down`, cada migración debe ser compatible con el código que todavía está en producción durante esa ventana.

Configuración de la primera vez:

1. Cargar **todas las env vars** en Vercel (Production, y Preview si se prueba Zapier ahí).
2. Verificar que **Fluid Compute** esté activo en el proyecto: es lo que permite `maxDuration = 300` en las rutas de chat y subida. Sin él, el techo vuelve a 60s y se cortan los turnos con varias imágenes sobre threads largos.
3. Dominio propio → en Supabase **Auth → URL Configuration**: `Site URL` y `Redirect URLs` (`https://<dominio>/auth/callback`) apuntando al dominio real. Si no coinciden, el login falla sin más pista que un error genérico.
4. **Google OAuth** en Supabase Auth → Providers → Google, con el Client ID/Secret de Google Cloud y el redirect URI de Supabase (`https://<project-ref>.supabase.co/auth/v1/callback`) registrado en Google Cloud. Sin esto no hay forma de entrar.
5. Activar **Upstash Redis** (integración nativa de Vercel) y cargar sus dos vars.

Después de cada deploy, verificar el dominio real, login, una ruta protegida sin sesión y una conversación con imagen usando una cuenta de prueba.

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
| Google con un correo **de la lista** | Entra a `/chat` |
| Google con uno **que no está** | `/unauthorized` con "tu correo no está en la lista" + link a Skool |
| Cancelar en el selector de cuentas de Google | `/login` avisa que se canceló — nunca una pantalla en blanco |

Después, esos tres intentos deben aparecer en **`/admin/members` → Accesos**.

---

## Scripts

Todos leen las credenciales de `.env.local`.

| Comando | Qué hace |
|---|---|
| `npm run admin:bootstrap -- <email>` | Da acceso y admin. Idempotente. |
| `npm run cleanup:orphans` | **Solo informa** (dry-run). Lista huérfanos nunca enviados (>30 días) y blobs de Storage sin registrar (>7 días), con GB medidos. **Nunca toca lo enviado alguna vez**. Para borrar de verdad: `npm run cleanup:orphans -- --confirm`. `--keep-days=N` y `--keep-unregistered-days=N` cambian las ventanas. |
| `npm run cleanup:orphans:auto` | Misma lógica que la Action semanal: informa siempre; borra solo si el uso medido ≥ `STORAGE_CLEAN_THRESHOLD_GB` (default 80 GB). |
| `npm run cleanup:orphan-users` | Borra cuentas de quien autenticó sin ser miembro (sin conversaciones, >7 días). **Solo informa**; hay que pasar `-- --confirm` para borrar. |
| `npm run backfill:gpt-config` | Migración puntual de configuración de GPTs. |
| `npm run backfill:messages` | Migración puntual de mensajes de threads. |
| `npm run audit:data-model` | Auditoría agregada de integridad y permisos. |
| `npm run report:storage` | Informe de solo lectura: uso de `chat-uploads` por tipo, edad y usuario, más miembros revocados/quietos. No borra nada. |

La Action [`.github/workflows/storage-governance.yml`](.github/workflows/storage-governance.yml) corre **domingo 10:00 UTC** (05:00 Colombia) como informe. Auto-borra solo basura never-sent cerca del techo (default 80 GB de 100). **Nunca** historial, mensajes, configs de GPT ni whitelist Skool. No es un cron de Vercel: el chat no se bloquea. Fail-closed si no puede clasificar un archivo.

---

## Repositorios

Dos remotos configurados:

| Remoto | Repositorio | Uso |
|---|---|---|
| `origin` | [`Danzstorm/gpt-skool-creativos`](https://github.com/Danzstorm/gpt-skool-creativos) | Repo principal (desarrollo) |
| `cliente` | [`martinvelardep/gpt-creativos`](https://github.com/martinvelardep/gpt-creativos) | Entrega al cliente |

Antes de empujar, confirma el destino:

```bash
git remote -v
git push origin master     # repo principal (Danzstorm)
git push cliente master    # entrega al cliente
```

---

Todo el detalle operativo está en [`docs/GUIA-DE-USO.md`](docs/GUIA-DE-USO.md).

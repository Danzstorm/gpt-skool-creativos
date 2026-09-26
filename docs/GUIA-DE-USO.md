# Guía de uso — GPT Creativos

Plataforma web privada de GPTs para una comunidad de Skool. Cada miembro tiene su propio chat (estilo ChatGPT desktop) con acceso a los GPTs que el administrador publica. Construida con Next.js + Supabase + OpenAI (Responses/Conversations API).

---

## 1. Cómo se accede (importante)

**Solo entran miembros de Skool.** No hay registro abierto. El puente entre Skool y la app es la **lista blanca** (`allowed_members`), que se llena vía CSV manual, import automático o webhook (ver §3). Una persona solo puede entrar si su email está en esa lista y está activo.

Formas de ingresar (las dos validadas contra la lista):

- **Google:** botón "Continuar con Google". Google muestra siempre el selector de cuentas; tras autenticarte, si tu email no está en la lista, se cierra la sesión y no entras. El primer login crea la cuenta (no hay registro aparte). Requiere configuración propia por cliente (ver §5).
- **Código por correo:** "Entrar con un código por correo" → la persona escribe su correo y recibe un código de 8 dígitos que escribe en la misma pantalla (vence en 1 hora, sirve una vez). Solo se envía si el correo está activo en la lista; la pantalla responde igual en ambos casos para no revelar quién es miembro. Reemplaza al enlace mágico, que fallaba si se abría en otro navegador o si un antivirus de correo lo abría primero. Rutas: `/api/auth/email-code` y `/api/auth/verify-code`; después se aplica el mismo gate que con Google (`src/lib/finish-login.ts`).
- Google **no permite** iniciar sesión desde el navegador embebido de Instagram/Facebook/TikTok; el login lo detecta y pide abrir la página en Chrome/Safari.

Si tu email no está en la lista, verás un mensaje para unirte al Skool.

> No existe "iniciar sesión con Skool" directo — Skool no lo ofrece a apps externas. La lista importada es el mecanismo real.

---

## 2. Para los miembros (uso del chat)

Al entrar caes en **`/chat`**, un shell fullscreen (sin header, como ChatGPT desktop):

- **Panel lateral (izquierda, colapsable)** con toggle arriba:
  - **GPTs** — la lista de asistentes disponibles. Clic para empezar una conversación.
  - **Chats** — tus conversaciones (todos los GPTs mezclados, como ChatGPT), ordenadas por actividad reciente.
  - Al pasar el cursor sobre un GPT aparece un icono para ver **solo las conversaciones de ese GPT** (popup aparte, no ensucia el panel principal).
  - Footer con tu nombre → menú con Catálogo, Admin (si aplica) y Salir.
- **Área de conversación** con composer inferior fijo (botón `+` para adjuntar, mic, enviar).

### Chatear
1. Elige un GPT → pantalla de inicio (avatar, nombre, descripción, autor, **sugerencias de inicio** clicables).
2. Escribe y **Enter** para enviar (Shift+Enter = salto de línea).
3. Respuesta en streaming; se puede **detener** con el botón cuadrado.
4. Clic en el nombre del GPT (header) o el icono de historial (sidebar) abre sus conversaciones anteriores.

### Adjuntar imágenes, archivos y videos
Todos los GPTs aceptan **imágenes** (visión), **documentos** y **videos** — sin distinción por GPT. Dos formas de adjuntar: el botón `+` (abre el selector de archivos directo, sin menú) o **pegar** con Ctrl+V, que solo toma imágenes. Las imágenes se numeran (**img 1, img 2…**) para GPTs que las referencian así.

**Videos**: hasta 100MB y 5 minutos. Gemini transcribe el audio (voz o letra, lo más literal posible) y arma una cronología de planos; eso es lo único que recibe el GPT (requiere `GEMINI_API_KEY`, ver §5). Si el clip es más largo, el composer lo dice y no lo sube. Mientras tanto se puede escribir; Enviar espera a que termine el adjunto. El composer muestra "Transcribiendo audio y escenas...".

### Copiar prompts
Los bloques de código (donde los GPTs devuelven prompts) traen botón **Copiar** siempre visible.

### Acciones sobre mensajes
Al pasar el mouse (o en móvil, siempre visible): **copiar**, **regenerar** (última respuesta), **editar y reenviar** (tu último mensaje).

### Micrófono (dictado)
Un clic para grabar, otro para detener y transcribir. Requiere **HTTPS o localhost** (en red local por IP el navegador lo bloquea).

### Límite de mensajes (si el admin lo configuró)
Si la comunidad tiene un límite mensual activo, al alcanzarlo el chat avisa con un mensaje claro y se reinicia el día 1 de cada mes. Por defecto no hay límite.

---

## 3. Para el administrador

El admin ve un enlace **Admin** (ámbar) en la barra superior del catálogo. Secciones:

### Dashboard (`/admin`)
Métricas de uso: GPTs activos, miembros con acceso, mensajes totales, usuarios activos, GPTs más usados, usuarios más activos, costo estimado de OpenAI.

### GPTs (`/admin/gpts`)
- **Crear/editar**: nombre, descripción, autor ("By …"), categoría, modelo, **system prompt**, sugerencias de inicio, icono (se sube y recorta a cuadrado).
- **Probar** (icono de matraz): abre un chat de prueba efímero contra ese GPT — funciona aunque esté **inactivo/borrador**. No se guarda ni aparece en el historial de nadie; sirve para validar el prompt antes de publicar.
- **Duplicar**: crea una copia inactiva (mismo prompt/modelo/starters) para iterar sin tocar el original en producción.
- Activar/desactivar (deja de verse en catálogo/chat de los alumnos, sin borrar sus conversaciones pasadas) o eliminar.
- Todos los GPTs tienen las mismas capacidades (archivos, código, visión) — no se configuran por separado.

### Miembros (`/admin/members`)
- **Importar CSV** de Skool (mapea email, nombre, tier, LTV, precio, fecha, invitado por). **Sincronización**: el CSV es fuente de verdad — nuevos se agregan, existentes se actualizan, los que ya no aparecen (y fueron dados de alta por CSV) se revocan. Las altas **manuales nunca se revocan** por sync. Guardarraíl: si el archivo trae <60% de los activos actuales, no revoca a nadie (probable export parcial).
- Tras un import, si hubo revocados se muestra la lista con botón **Reactivar** por si el export vino incompleto.
- **Exportar CSV** — descarga el estado actual completo (útil como backup o para llevar a otra herramienta).
- **Límite mensual por miembro** (columna con input) — vacío = usa el default global de Ajustes.
- **Actividad de integración** (abajo de la página): últimos eventos recibidos del webhook de Skool/Zapier, con éxito/error — para confirmar que la automatización realmente está llegando.
- Agregar manual, revocar/restaurar, eliminar.

### Ajustes (`/admin/settings`) — white-label
Nombre de la comunidad, logo, URL de Skool, email de soporte y **límite mensual de mensajes por defecto**. Esto reemplaza todo lo que antes estaba hardcodeado como "Creativos" en header/landing/login — es lo único que cambia para llevar la plataforma a un cliente nuevo (ver §5).

### Automatizar altas/bajas — webhook

```
POST /api/webhooks/skool
Header:  x-webhook-secret: <SKOOL_WEBHOOK_SECRET>
Body:    { "email": "persona@correo.com", "action": "add" | "remove", "full_name": "..." }
```

`action:"add"` (o cualquier valor no reconocido) activa/crea el miembro; `remove`/`cancel`/`churn` lo revoca. Sin el secreto correcto → 401. Cada llamada exitosa o fallida queda registrada en `/admin/members` (sección de actividad).

Para el CSV diario automatizado (en vez de subirlo a mano) existe además:
```
POST /api/webhooks/skool/bulk
Header:  x-webhook-secret: <SKOOL_WEBHOOK_SECRET>
Body:    { "members": [ {fila...}, ... ], "sync"?: true }
```
Acepta filas normalizadas o los encabezados crudos de Skool. Ver §6 (Zapier) para el paso a paso de cómo conectarlo.

### Designar admins

Desde **Ajustes → Administradores** en el propio panel: se agrega por correo. Si la
persona ya entró alguna vez, queda admin al instante; si nunca entró, se le habilita
el acceso y queda admin sola la primera vez que entre. No hay que volver a hacer nada.

Para el **primer** admin de una instancia (todavía no hay panel al que entrar):

```bash
node --env-file=.env.local scripts/bootstrap-admin.mjs admin@cliente.com
```

> No uses `UPDATE profiles SET is_admin = true` a mano. Marca el perfil pero **no**
> crea la fila en `allowed_members`, así que el gate de membresía expulsa a esa
> persona a `/unauthorized` en su primer request: queda "admin" en la base y sin
> poder entrar. El script hace las dos cosas y es idempotente.

---

## 4. Correr el proyecto localmente

Desde `gpt-creativos/`:

```bash
npm install
npm run dev     # desarrollo
```

Para ver la velocidad real (producción):
```bash
npm run build && npm run start
```

> **Importante (Windows/Turbopack):** no corras `npm run build` mientras `npm run dev` está activo sobre la misma carpeta — ambos comparten `.next/` y borrar/reconstruir en caliente puede corromper la caché de Turbopack (error tipo "Unable to open static sorted file"). Si pasa, cierra el proceso de `dev`, borra `.next/dev/cache` y vuelve a levantarlo.

Variables en `.env.local` (no se sube a git):
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
GEMINI_API_KEY=...                   # opcional: sin esto, adjuntar un video devuelve error claro; el resto del chat sigue funcionando
NEXT_PUBLIC_SKOOL_URL=...            # fallback si Ajustes no tiene skool_url cargado
SKOOL_WEBHOOK_SECRET=...             # secreto compartido con Zapier/Make/Skool
UPSTASH_REDIS_REST_URL=...           # opcional en local; recomendado en producción (ver §5)
UPSTASH_REDIS_REST_TOKEN=...
```

El esquema de base de datos vive en `supabase/migrations/` (fuente de verdad — `schema.sql` es solo un snapshot histórico congelado).

### Dónde viven las credenciales, y cómo recuperarlas

**Vercel es el sistema de registro.** Las once variables de producción están cargadas y cifradas en el proyecto, dentro de la cuenta del cliente. No hay que guardarlas en ningún otro lado: sobreviven a cualquier computadora, y si alguien pierde su copia local se recuperan desde ahí.

Ver qué hay cargado, sin exponer ningún valor:

```bash
npx vercel env ls production --scope creativos-skool
```

Traerlas a un archivo local (pide `VERCEL_TOKEN` en el entorno):

```bash
# Escribe .env.production.local con TODAS las de producción.
npx vercel env pull .env.production.local --environment=production --scope creativos-skool
```

> Ojo con el nombre del archivo: `vercel env pull` sin argumento escribe sobre `.env.local` y **pisa lo que tengas ahí**. Pasando un nombre distinto, tu archivo de trabajo queda intacto y comparas con calma. Ambos están en `.gitignore`.

Recuperar una sola:

```bash
npx vercel env pull .env.tmp --environment=production --scope creativos-skool
grep GEMINI_API_KEY .env.tmp && rm .env.tmp
```

**Lo que NO hay que hacer:** copiar estos valores a la guía, al README, a un archivo de notas o a un chat. Cualquiera de esos termina en git, en una sincronización a la nube o en el historial de una herramienta, y ahí ya no se sabe quién los tiene. Si necesitas una copia fuera de Vercel, que sea en un gestor de contraseñas.

**Si una credencial se filtra**, se rota en su origen y se recarga acá — no hace falta tocar código:

| Credencial | Dónde se rota | Después |
|---|---|---|
| `OPENAI_API_KEY` | platform.openai.com → API keys | Recargar en Vercel y redesplegar. Ojo: las Conversations creadas con la key vieja se recrean solas (ver `conversation-sync.ts`) |
| `GEMINI_API_KEY` | aistudio.google.com/apikey | Recargar y redesplegar |
| `UPSTASH_REDIS_REST_TOKEN` | consola de Upstash, en la base | Recargar y redesplegar; se pierden los contadores en curso, nada más |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API | Recargar y redesplegar |
| `SKOOL_WEBHOOK_SECRET` | lo generas tú (`openssl rand -hex 24`) | Recargar acá **y** actualizar el Zap en Zapier, o las altas dejan de entrar |

Para recargar cualquiera:

```bash
npx vercel env rm NOMBRE production --scope creativos-skool
npx vercel env add NOMBRE production --scope creativos-skool
```

Las variables no toman efecto hasta el siguiente despliegue: un push a `master` alcanza.

---

## 5. Qué necesita el cliente para tener su propia instancia

Esta plataforma es **single-tenant por diseño**: cada cliente corre su propia copia con su propio Supabase, su propio OpenAI y su propio dominio. Replicar para un cliente nuevo = clonar el repo + estas cuentas, sin tocar código (salvo Ajustes en `/admin/settings`).

### Cuentas que el cliente debe crear/proveer

| Servicio | Para qué | Quién lo crea |
|---|---|---|
| **Supabase** (proyecto nuevo) | Auth, base de datos, storage de iconos/archivos | El cliente (o tú, a su nombre) |
| **OpenAI** (API key propia) | Todos los mensajes de chat se facturan a esta cuenta | El cliente — **importante**: es su costo, no el tuyo |
| **Vercel** (proyecto) | Hosting del sitio | El cliente o tu agencia |
| **Google Cloud Console** (OAuth Client) | Login con Google — la única forma de entrar, **bloqueante para lanzar** | El cliente |
| **Google AI Studio** (`GEMINI_API_KEY`) | Describir los videos que se adjuntan al chat — [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | El cliente — es su costo, igual que OpenAI. **Solo necesario si quiere adjuntar video**; sin la key el resto del chat funciona igual (ver abajo qué pasa exactamente) |
| **Zapier** (o Make) | Automatizar altas/bajas desde Skool | El cliente (ya lo tienen, según mencionaste) |
| **Upstash** (Redis, capa gratis alcanza) | Rate limiting compartido en producción | Recomendado, no bloqueante para lanzar |
| **Resend** (SMTP) | Envía los códigos de acceso por correo — ver §7 | Sí (ya configurado) |

#### Qué pasa exactamente sin `GEMINI_API_KEY`

La app no se rompe ni esconde nada: el botón `+` de adjuntar sigue estando y las imágenes y documentos funcionan igual. Lo que cambia es solo el video:

- El selector de archivos deja de listar videos. Ojo, eso es una **pista del navegador, no un candado**: en el diálogo del sistema se puede cambiar a "Todos los archivos" y elegir el video igual.
- El candado real está en el servidor. `/api/upload/sign` rechaza el video **antes** de firmar la subida, así que no llega a ocupar Storage, y `/api/upload/register` responde 503 nombrando la variable que falta.

Con la key cargada, el video **nunca se sube a OpenAI**: va a Gemini, que devuelve una descripción en texto, se guarda en `uploaded_files.video_description` y *eso* es lo único que el modelo llega a "ver".

> **Un detalle que rompe el video incluso con la key puesta:** el bucket `chat-uploads` tiene que estar en 100MB. Lo deja así la migración `20260906120000_video_uploads.sql`, pero si el bucket se creó a mano antes de aplicarla, se queda en el límite viejo y Storage rechaza la subida sin que la key tenga nada que ver. Tiene que coincidir con `MAX_VIDEO_SIZE_MB` de `src/lib/upload-limits.ts`.

### Pasos de setup (Supabase)

En este orden. Los pasos 4 y 5 son los que más fallos de login causan si se saltan.

1. Crear proyecto en Supabase (elegir región cercana a los usuarios).
2. `supabase link --project-ref <ref>` y `supabase db push` para aplicar todas las migraciones de `supabase/migrations/`.
3. Crear los dos buckets de Storage:
   - `gpt-icons` (público) — íconos de GPT.
   - `chat-uploads` (privado, **límite de 100MB**) — adjuntos del chat, servidos con
     URLs firmadas. El límite lo deja puesto la migración `20260906120000`, pero si
     creas el bucket a mano **después** de correr `db push` se queda en el default de
     Supabase y el video falla aunque `GEMINI_API_KEY` esté bien cargada. Tiene que
     coincidir con `MAX_VIDEO_SIZE_MB` de `src/lib/upload-limits.ts`.
4. **Google OAuth** (Auth → Providers → Google) con el Client ID/Secret de Google
   Cloud — ver "Pasos de setup (Google OAuth)" más abajo. Sin esto no hay forma
   de entrar.
5. **Auth → URL Configuration** con el dominio real:
   - Site URL: `https://<dominio>`
   - Redirect URLs: `https://<dominio>/auth/callback`

   Si no coinciden, Supabase rechaza el redirect y el login falla con
   `?error=auth_failed` sin más pistas.
6. Auth → Providers → Email: puede quedar deshabilitado; el login ya no lo usa.
7. Crear el primer admin (ver §3):
   `node --env-file=.env.local scripts/bootstrap-admin.mjs admin@cliente.com`
8. Copiar URL + anon key + service role key a las env vars de Vercel — junto con el
   resto de la lista de §4, que incluye `OPENAI_API_KEY` y, si se quiere video,
   `GEMINI_API_KEY`. Estos tres pasos enumeran solo lo de Supabase; la lista completa
   está en §4.

### Verificar que el login quedó bien

Antes de invitar a nadie, comprobar los tres caminos desde el dominio real:

| Prueba | Esperado |
|---|---|
| Google con un correo **que está** en `allowed_members` | Entra a `/chat` |
| Google con un correo **que no está** | `/unauthorized` con "tu correo no está en la lista" + link a Skool |
| Cancelar en el selector de cuentas de Google | `/login` con el aviso de acceso cancelado (no una pantalla muda) |

Después, en **Miembros → Accesos** del panel deben aparecer esos intentos con su
motivo. Si esa lista está vacía tras las pruebas, la auditoría no está llegando y
conviene revisarlo antes de lanzar: es lo único que permite depurar un "no puedo
entrar" en producción.

### Pasos de setup (Google OAuth) — obligatorio
1. En Google Cloud Console: crear proyecto → APIs & Services → Credentials → **OAuth 2.0 Client ID** (tipo *Web application*).
2. **Authorized redirect URI**: `https://<project-ref>.supabase.co/auth/v1/callback` (lo da Supabase, no tu dominio).
3. Copiar Client ID + Secret a Supabase → Auth → Providers → Google.
4. En la pantalla de consentimiento de Google Cloud, publicar la app (estado *In production*); en *Testing* solo entran los correos de prueba listados y el resto ve un error de Google.

### Deploy en Vercel — recomendaciones
1. **Plan**: Hobby alcanza. Las rutas de chat declaran `maxDuration = 300` (respuestas largas de streaming) y con **Fluid Compute** activo ese tope se respeta también en Hobby — verificado en el proyecto (`fluid: true`, `functionDefaultTimeout: 300`). Pro solo aporta el auto-deploy nativo por push, que este proyecto resuelve por GitHub Actions (ver README → Deploy).
2. Cargar todas las env vars de §4 en Vercel (Production + Preview si se va a probar Zapier en preview).
3. Dominio propio → actualizar en Supabase Auth: Site URL + Redirect URLs allowlist al dominio real (si no, Google devuelve al dominio equivocado y el login falla).
4. Activar **Upstash Redis** (integración nativa de Vercel, un clic) y cargar `UPSTASH_REDIS_REST_URL`/`TOKEN` — sin esto el rate limiting es por instancia serverless, no global, y en tráfico real dos instancias distintas no comparten el contador.

### Gobernanza de Storage (automática, no toca el chat)
Una Action semanal (domingo 05:00 Colombia) **solo informa**. Auto-borra únicamente subidas del composer que nunca se enviaron (>30 días) y blobs firmados sin `/register` (>7 días), y solo si el uso medido supera **80 GB** (80% del techo Pro de 100 GB; configurable con `STORAGE_CLEAN_THRESHOLD_GB`). **Nunca** borra historial, mensajes, configs de GPT ni la whitelist de Skool. No hay banners en el chat. Local: `npm run report:storage` y `npm run cleanup:orphans` (dry-run). Si el plan es Free (1 GB), hay que setear `STORAGE_QUOTA_GB`.

### Chats en paralelo y contexto — cómo funciona (para que quede claro)
- **Cada conversación (thread) tiene su propia Conversation de OpenAI** (`openai_conversation_id`). El contexto completo de esa conversación **vive del lado de OpenAI**, no en nuestra base de datos — la tabla `messages` local es solo una caché para pintar la UI al instante sin re-pedir todo el historial. Por eso nunca se "pierde contexto": cada vez que se envía un mensaje, se manda a la misma Conversation y OpenAI ya sabe todo lo anterior.
- **Concurrencia entre usuarios**: cada request es una función serverless independiente en Vercel — dos alumnos distintos chateando al mismo tiempo no se bloquean entre sí, escalan horizontalmente sin configuración extra.
- **Concurrencia dentro de la misma conversación**: hay un lock (`acquire_thread_lock`/`release_thread_lock`, tabla en Postgres) que impide que la misma conversación reciba dos respuestas a la vez (ej. doble clic, dos pestañas abiertas) — el segundo intento recibe un aviso de "ya hay una respuesta en curso" en vez de romper el hilo.
- **Postgres**: Supabase usa un connection pooler (Supavisor) — muchas funciones serverless abriendo conexiones cortas es exactamente el caso de uso que resuelve, no requiere tuning manual a esta escala.

---

## 6. Conectar Zapier (Skool → alta automática)

**¿Se puede probar en local?** Parcialmente. Zapier necesita una **URL pública HTTPS** para poder llamar al webhook — `localhost` no es alcanzable desde internet. Lo que sí puedes hacer sin desplegar:
- Simular exactamente lo que Zapier enviaría con `curl` contra tu servidor local, para validar la lógica antes de configurar el Zap real (así se probó en esta sesión: `POST /api/webhooks/skool` con el secreto correcto agregó el miembro y quedó registrado en el log de actividad).
- Para probar el **Zap real** (disparo desde Skool → llega a tu app), necesitas una URL pública: la más simple es apuntar el Zap a tu **deploy de Vercel** (production o incluso una preview URL de una rama) — no hace falta túnel ni nada especial, cualquier deploy de Vercel ya es HTTPS público.

### Paso a paso en Zapier
1. **Trigger**: buscar la app de Skool en Zapier (si Skool tiene integración nativa) con el evento "New Member" o "New Payment". Si no existe una integración nativa madura, alternativa: trigger por el email de notificación de Skool (parseo) o por una hoja de cálculo que Skool alimente.
2. **Action**: **Webhooks by Zapier** → **POST**.
   - URL: `https://<tu-dominio>/api/webhooks/skool`
   - Headers: `x-webhook-secret` = el valor de `SKOOL_WEBHOOK_SECRET`
   - Data (form o JSON): `email` (mapeado del trigger), `action` = `add`, `full_name` (opcional).
3. **Zap de bajas**: duplicar el Zap con el trigger de cancelación/reembolso de Skool, mismo webhook, `action` = `remove`.
4. **Verificar**: entra a `/admin/members` → sección "Actividad de integración" → debe verse el evento con `OK`. Si sale `Error`, el mensaje de error queda ahí mismo (no hay que revisar logs de Vercel para lo básico).
5. Para el CSV diario en vez de manual: un Zap con trigger de calendario (diario) → busca/exporta el CSV de Skool → **Webhooks by Zapier POST** a `/api/webhooks/skool/bulk` con `{"members":[...]}` armado desde el CSV parseado (Zapier tiene un paso "Formatter"/"CSV" para esto, o Storage by Zapier si el CSV se sube a otro lado primero).

> Al entregar al cliente: dales el valor de `SKOOL_WEBHOOK_SECRET` por un canal seguro (no por email plano) y muéstrales la sección de actividad en `/admin/members` como su forma de verificar que todo sigue funcionando sin tener que preguntarte a ti.

---

## 7. Correo (SMTP) — códigos de acceso

El acceso por código envía correos desde Supabase Auth con Resend (Supabase →
Authentication → Emails → SMTP Settings: host `smtp.resend.com`, puerto 465,
usuario `resend`, contraseña = API key; remitente `noreply@send.creativos.lat`).
El SMTP default de Supabase (2 correos/hora) no alcanza.

Las plantillas (solo código, sin enlace) viven en `supabase/email-templates/` y
se publican con `scripts/apply-email-templates.mjs`. Para que no caigan en spam
el dominio necesita SPF y DKIM (ya están) y un registro DMARC en
`_dmarc.creativos.lat`.

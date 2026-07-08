# Guía de uso — GPT Creativos

Plataforma web privada de GPTs para una comunidad de Skool. Cada miembro tiene su propio chat (estilo ChatGPT desktop) con acceso a los GPTs que el administrador publica. Construida con Next.js + Supabase + OpenAI (Responses/Conversations API).

---

## 1. Cómo se accede (importante)

**Solo entran miembros de Skool.** No hay registro abierto. El puente entre Skool y la app es la **lista blanca** (`allowed_members`), que se llena vía CSV manual, import automático o webhook (ver §3). Una persona solo puede entrar si su email está en esa lista y está activo.

Formas de ingresar (ambas se validan contra la lista):

- **Enlace mágico (magic link):** metes tu email → si estás en la lista, te llega un enlace al correo → clic → entras. Sin contraseñas.
- **Google:** botón "Continuar con Google". Tras autenticarte, si tu email no está en la lista, se cierra la sesión y no entras. Requiere configuración propia por cliente (ver §5).

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

### Adjuntar imágenes y archivos
Todos los GPTs aceptan **imágenes** (visión) y **documentos**. Tres formas: botón `+` → Imágenes/Archivos, **pegar** con Ctrl+V, o **arrastrar y soltar**. Las imágenes se numeran (**img 1, img 2…**) para GPTs que las referencian así.

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

Para designar un admin (una sola vez, manual en la base de datos):
```sql
UPDATE profiles SET is_admin = true WHERE email = 'tu@email.com';
```

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
NEXT_PUBLIC_SKOOL_URL=...            # fallback si Ajustes no tiene skool_url cargado
SKOOL_WEBHOOK_SECRET=...             # secreto compartido con Zapier/Make/Skool
UPSTASH_REDIS_REST_URL=...           # opcional en local; recomendado en producción (ver §5)
UPSTASH_REDIS_REST_TOKEN=...
```

El esquema de base de datos vive en `supabase/migrations/` (fuente de verdad — `schema.sql` es solo un snapshot histórico congelado).

---

## 5. Qué necesita el cliente para tener su propia instancia

Esta plataforma es **single-tenant por diseño**: cada cliente corre su propia copia con su propio Supabase, su propio OpenAI y su propio dominio. Replicar para un cliente nuevo = clonar el repo + estas cuentas, sin tocar código (salvo Ajustes en `/admin/settings`).

### Cuentas que el cliente debe crear/proveer

| Servicio | Para qué | Quién lo crea |
|---|---|---|
| **Supabase** (proyecto nuevo) | Auth, base de datos, storage de iconos/archivos | El cliente (o tú, a su nombre) |
| **OpenAI** (API key propia) | Todos los mensajes de chat se facturan a esta cuenta | El cliente — **importante**: es su costo, no el tuyo |
| **Vercel** (proyecto) | Hosting del sitio | El cliente o tu agencia |
| **Google Cloud Console** (OAuth Client) | Solo si quiere login con Google | El cliente — **solo necesario si usa Google login**; el magic link por email no lo requiere |
| **Zapier** (o Make) | Automatizar altas/bajas desde Skool | El cliente (ya lo tienen, según mencionaste) |
| **Upstash** (Redis, capa gratis alcanza) | Rate limiting compartido en producción | Recomendado, no bloqueante para lanzar |
| **Resend / Postmark** (SMTP) | Que el magic link no caiga en spam | Recomendado antes de tráfico real — el SMTP default de Supabase es rate-limited |

### Pasos de setup (Supabase)
1. Crear proyecto en Supabase (elegir región cercana a los usuarios).
2. `supabase link --project-ref <ref>` y `supabase db push` para aplicar todas las migraciones de `supabase/migrations/`.
3. Crear los dos buckets de Storage:
   - `gpt-icons` (público) — íconos de GPT.
   - `chat-uploads` (privado) — adjuntos del chat, servidos con URLs firmadas.
4. Auth → Providers → Email: habilitar magic link, `redirect URL` = `https://<dominio>/auth/callback`.
5. Crear el primer admin: `UPDATE profiles SET is_admin = true WHERE email = '...';` (tras su primer login, porque `profiles` se llena vía trigger al crear el usuario en `auth.users`).
6. Copiar URL + anon key + service role key a las env vars de Vercel.

### Pasos de setup (Google OAuth) — solo si lo quieren
1. En Google Cloud Console: crear proyecto → APIs & Services → Credentials → **OAuth 2.0 Client ID** (tipo *Web application*).
2. **Authorized redirect URI**: `https://<project-ref>.supabase.co/auth/v1/callback` (lo da Supabase, no tu dominio).
3. Copiar Client ID + Secret a Supabase → Auth → Providers → Google.
4. Sin esto, el botón "Continuar con Google" del login falla — pero el magic link funciona igual sin ningún paso extra.

### Deploy en Vercel — recomendaciones
1. **Plan**: usar **Vercel Pro** como mínimo. Las rutas de chat declaran `maxDuration = 60` (respuestas largas de streaming); el plan Hobby limita/trunca funciones más agresivamente y puede cortar respuestas a mitad.
2. Cargar todas las env vars de §4 en Vercel (Production + Preview si se va a probar Zapier en preview).
3. Dominio propio → actualizar en Supabase Auth: Site URL + Redirect URLs allowlist al dominio real (si no, el magic link redirige mal).
4. Activar **Upstash Redis** (integración nativa de Vercel, un clic) y cargar `UPSTASH_REDIS_REST_URL`/`TOKEN` — sin esto el rate limiting es por instancia serverless, no global, y en tráfico real dos instancias distintas no comparten el contador.
5. SMTP propio (Resend/Postmark) en Supabase Auth → Email — el default de Supabase tiene un límite bajo y a veces cae en spam.

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

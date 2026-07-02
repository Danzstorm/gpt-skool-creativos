# Guía de uso — GPT Creativos

Plataforma web privada de GPTs para la comunidad de Skool Creativos. Cada miembro tiene su propio chat (estilo ChatGPT) con acceso a los GPTs que el administrador publica. Construida con Next.js + Supabase + OpenAI Assistants API.

---

## 1. Cómo se accede (importante)

**Solo entran miembros de Skool.** No hay registro abierto. El puente entre Skool y la app es la **lista blanca** (`allowed_members`), que el admin importa desde el export CSV de Skool. Una persona solo puede entrar si su email está en esa lista y está activo.

Formas de ingresar (ambas se validan contra la lista):

- **Enlace mágico (magic link):** metes tu email → si estás en la lista, te llega un enlace al correo → clic → entras. Sin contraseñas.
- **Google:** botón "Continuar con Google". Tras autenticarte, si tu email no está en la lista, se cierra la sesión y no entras.

Si tu email no está en la lista, verás un mensaje para unirte al Skool.

> No existe "iniciar sesión con Skool" directo — Skool no lo ofrece a apps externas. La lista importada del CSV es el mecanismo.

---

## 2. Para los miembros (uso del chat)

Al entrar caes en **`/chat`**. La pantalla tiene:

- **Panel lateral (izquierda):**
  - **GPTs** — la lista de asistentes disponibles. Clic en uno para empezar una conversación con él.
  - **Chats** — tus conversaciones anteriores (de todos los GPTs), cada una con el icono de su GPT. Hay buscador si tienes muchas.
  - **Nuevo chat** — arriba, para empezar de cero.
- **Área de conversación (derecha)** con el composer abajo.

### Chatear
1. Elige un GPT en el panel → aparece su pantalla de inicio (nombre, descripción y **sugerencias de inicio** clicables).
2. Escribe tu mensaje y **Enter** para enviar (Shift+Enter para salto de línea).
3. La respuesta llega en streaming. Puedes **detenerla** con el botón cuadrado.

### Adjuntar imágenes y archivos
Todos los GPTs aceptan **imágenes** (visión) y **documentos** (PDF, texto, CSV, etc.). Tres formas:
- Clic en el **clip** 📎 y elige archivos.
- **Pega** una imagen con Ctrl+V.
- **Arrastra y suelta** sobre el chat.

Las imágenes se muestran como miniaturas numeradas (**img 1, img 2…**) — útil para GPTs que las referencian como `@image_1`, `@image_2`.

### Copiar prompts
Cuando un GPT devuelve un prompt, sale dentro de un bloque con una barra "Prompt" y un botón **Copiar** siempre visible. Un clic lo copia limpio, listo para pegar.

### Acciones sobre mensajes
Al pasar el mouse sobre un mensaje (o directo en móvil) aparecen:
- **Copiar** el mensaje completo.
- **Regenerar** (en la última respuesta del asistente) — genera otra versión.
- **Editar** (en tu último mensaje) — corrige y reenvía.

### Micrófono (dictado)
Botón de micrófono 🎙️: **un clic para grabar, otro para detener**. Al detener, transcribe tu voz a texto en el input.
> Requiere **HTTPS o localhost**. En red local por IP el navegador lo bloquea; funciona en el sitio desplegado (HTTPS).

---

## 3. Para el administrador

El admin ve un enlace **Admin** (ámbar) en la barra superior. Un miembro normal no lo ve. Secciones:

### Dashboard (`/admin`)
Métricas de uso: GPTs activos, miembros con acceso, mensajes totales, usuarios activos, **GPTs más usados** (gráfico) y **usuarios más activos** (mensajes / GPTs distintos / chats).

### GPTs (`/admin/gpts`)
- **Crear / editar** un GPT: nombre, descripción, categoría (campo libre), modelo, **system prompt** (se trae de OpenAI al editar), **sugerencias de inicio**, e **icono** (se sube una imagen y se recorta a cuadrado).
- Todos los GPTs tienen todas las capacidades (lectura de archivos, código, visión) — no se configuran por separado.
- Activar/desactivar o eliminar.

> Un "GPT" aquí = un Assistant de OpenAI. El system prompt vive en OpenAI, no en la base de datos. El `openai_assistant_id` nunca sale del servidor.

### Miembros (`/admin/members`)
- **Importar CSV** de Skool: mapea email, nombre y métricas (**tier, LTV, precio, fecha de ingreso, invitado por**). Reimportar actualiza los existentes.
- **Barra resumen**: total, activos, LTV total, conteo por tier.
- Agregar un miembro manual, **revocar/restaurar** acceso, o eliminar.

Para designar un admin (una sola vez, manual en la base de datos):
```sql
UPDATE profiles SET is_admin = true WHERE email = 'tu@email.com';
```

---

## 4. Correr el proyecto localmente

Desde `gpt-creativos/`:

```bash
npm install
npm run dev     # desarrollo (compila por ruta; se siente lento al navegar)
```

Para ver la **velocidad real**, usar producción:
```bash
npm run build && npm run start
```
Abrir http://localhost:3000. Los cambios de datos (GPTs, iconos, miembros) se ven sin reconstruir; los cambios de código requieren `build` de nuevo.

Variables en `.env.local` (no se sube a git):
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
```

El esquema de base de datos está en `supabase/schema.sql`.

---

## 5. Notas para el deploy (Vercel)

Pendiente al momento de escribir esto. Antes de deploy:
1. Cargar las 4 variables de entorno en Vercel.
2. En Supabase → Auth → URL Configuration: agregar el dominio de producción (Site URL + redirect allowlist), o el magic link se rompe.
3. Las rutas de streaming ya declaran `maxDuration = 60` (el plan de Vercel debe permitir funciones largas).
4. Para el login con Google: habilitar el provider en Supabase Auth + credenciales de Google Cloud.
5. Recomendado con tráfico real: migrar el rate limiter (`src/lib/rate-limit.ts`, hoy en memoria) a Upstash Redis para un límite global en serverless.

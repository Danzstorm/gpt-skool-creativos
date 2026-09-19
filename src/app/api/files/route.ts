import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { threadAttachmentLabels, threadFileIds } from "@/lib/message-attachments";
import { matchLibraryRows, type LibraryFile } from "@/lib/file-library";

// Re-exportado: el menú `@` del composer ya no consume esta ruta.
export type { LibraryFile };

/** Tope duro: el menú muestra una lista corta, no un explorador de archivos. */
const MAX_RESULTS = 50;

/**
 * Biblioteca de archivos del CHAT ACTUAL, para poder re-adjuntarlos con `@`
 * sin volver a subirlos.
 *
 * Escopeada al hilo a propósito: antes buscaba en todo lo que el usuario
 * subió en cualquier conversación, y `@` terminaba sugiriendo archivos de
 * chats sin relación entre sí. `messages.files` (no `message_attachments`,
 * que todavía es una tabla sombra best-effort — ver message-attachments.ts)
 * es el read model real de qué se adjuntó en qué mensaje, así que de ahí sale
 * la lista de `openai_file_id` permitidos para este hilo.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = await checkRateLimit(`files:${user.id}`, 30, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const threadId = request.nextUrl.searchParams.get("threadId")?.trim() ?? "";

  // Un chat nuevo todavía no tiene mensajes propios: nada que referenciar.
  if (!threadId) return NextResponse.json([]);

  // service_role y no el cliente RLS: `uploaded_files` tiene RLS activa SIN
  // policies y con los permisos revocados para `authenticated`, así que es una
  // tabla solo-servidor por diseño. El filtro por user_id de abajo ES la
  // frontera de acceso, y por eso va siempre y no es opcional.
  const service = createServiceClient();

  // Ordenados del más viejo al más nuevo: threadAttachmentLabels se queda con
  // la PRIMERA aparición de cada archivo, así un adjunto reusado con `@`
  // conserva el rótulo con el que el modelo lo conoció.
  const { data: threadMessages, error: threadMessagesError } = await service
    .from("messages")
    .select("files, created_at")
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (threadMessagesError) {
    console.error("files list error (thread scope)", {
      code: threadMessagesError.code,
      message: threadMessagesError.message,
    });
    return NextResponse.json({ error: "No se pudo cargar tu biblioteca" }, { status: 500 });
  }

  // El `.eq("user_id", user.id)` de arriba ya acota qué hilo se puede leer,
  // pero `uploaded_files` es su propia tabla sin RLS: lleva su propio filtro
  // por dueño abajo, no puede depender solo de la query anterior para eso.
  const fileIds = threadFileIds(threadMessages ?? []);
  const labels = threadAttachmentLabels(threadMessages ?? []);
  if (fileIds.length === 0) return NextResponse.json([]);

  // Sin filtro en Postgres: la lista ya está acotada a los archivos de ESTE
  // hilo, que son decenas, no la biblioteca entera. Traerlos y filtrarlos acá
  // permite buscar también por el rótulo ("imagen 2"), que no es una columna
  // sino algo que se calcula desde messages.files. Con el `ilike` de antes,
  // escribir `@imagen` no encontraba nada: el menú mostraba un vocabulario y
  // el buscador entendía otro.
  const { data, error } = await service
    .from("uploaded_files")
    .select("openai_file_id, name, mime, storage_path, created_at")
    .eq("user_id", user.id)
    .in("openai_file_id", fileIds)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("files list error", { code: error.code, message: error.message });
    return NextResponse.json({ error: "No se pudo cargar tu biblioteca" }, { status: 500 });
  }

  const matches = matchLibraryRows(data ?? [], labels, q).slice(0, MAX_RESULTS);

  // Miniaturas solo para imágenes, y recién sobre lo que sobrevivió al filtro:
  // firmar es una llamada por archivo y no se paga por filas que nadie va a ver.
  const files: LibraryFile[] = await Promise.all(
    matches.map(async (entry) => {
      const { row, base } = entry;
      if (base.type !== "image" || !row.storage_path) return base;

      const { data: signed } = await service.storage
        .from("chat-uploads")
        .createSignedUrl(row.storage_path, 3600);
      return signed?.signedUrl ? { ...base, previewUrl: signed.signedUrl } : base;
    })
  );

  return NextResponse.json(files);
}

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/** Tope duro: el menú muestra una lista corta, no un explorador de archivos. */
const MAX_RESULTS = 50;

export interface LibraryFile {
  openai_file_id: string;
  name: string;
  type: "image" | "document";
  created_at: string;
  /** URL firmada de Storage, solo para imágenes (la miniatura del menú). */
  previewUrl?: string;
}

/**
 * Biblioteca de archivos del usuario: todo lo que subió en cualquier
 * conversación, para poder re-adjuntarlo con `@` sin volver a subirlo.
 *
 * Es de la PERSONA, no del GPT: alguien sube un brief trabajando con un GPT y
 * lo reusa en otro. Si cada GPT tuviera su isla, casi nunca encontraría nada.
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

  // service_role y no el cliente RLS: `uploaded_files` tiene RLS activa SIN
  // policies y con los permisos revocados para `authenticated`, así que es una
  // tabla solo-servidor por diseño. El filtro por user_id de abajo ES la
  // frontera de acceso, y por eso va siempre y no es opcional.
  const service = createServiceClient();

  let query = service
    .from("uploaded_files")
    .select("openai_file_id, name, mime, storage_path, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_RESULTS);

  // El filtro por nombre se hace en Postgres para no traer toda la biblioteca
  // y descartarla en memoria. `%` y `_` se escapan: sin eso, escribir "%" en el
  // buscador devuelve todo y "_" hace de comodín, que confunde sin avisar.
  if (q) {
    const escaped = q.replace(/[\\%_]/g, (match) => `\\${match}`);
    query = query.ilike("name", `%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("files list error", { code: error.code, message: error.message });
    return NextResponse.json({ error: "No se pudo cargar tu biblioteca" }, { status: 500 });
  }

  const rows = data ?? [];

  // Miniaturas solo para imágenes. Firmar es una llamada por archivo, así que
  // se hacen en paralelo y solo para las que se van a ver.
  const files: LibraryFile[] = await Promise.all(
    rows.map(async (row) => {
      const isImage = row.mime?.startsWith("image/") ?? false;
      const base: LibraryFile = {
        openai_file_id: row.openai_file_id,
        name: row.name || (isImage ? "imagen" : "archivo"),
        type: isImage ? "image" : "document",
        created_at: row.created_at,
      };
      if (!isImage || !row.storage_path) return base;

      const { data: signed } = await service.storage
        .from("chat-uploads")
        .createSignedUrl(row.storage_path, 3600);
      return signed?.signedUrl ? { ...base, previewUrl: signed.signedUrl } : base;
    })
  );

  return NextResponse.json(files);
}

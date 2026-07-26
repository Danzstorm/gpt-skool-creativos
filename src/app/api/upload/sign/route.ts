import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { rejectReason } from "@/lib/upload-limits";
import { normalizeUploadFileName } from "@/lib/upload-file";

// Paso 1 de 2 de la subida de adjuntos.
//
// Devuelve una URL firmada para que el navegador suba el archivo DIRECTO a
// Supabase Storage. El archivo nunca pasa por una función de Vercel, que es lo
// que antes limitaba todo a 4.5MB. Acá solo viajan metadatos.
//
// Paso 2: /api/upload/register (copia de Storage a OpenAI).

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rl = await checkRateLimit(`upload:${user.id}`, 20, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  const { name, type, size } = await request.json().catch(() => ({}));
  if (typeof name !== "string" || typeof size !== "number") {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  // Validar ANTES de firmar: si no, el navegador sube 25MB a Storage y recién
  // el registro lo rechaza, con el archivo ya ocupando espacio.
  const reason = rejectReason(typeof type === "string" ? type : "", size);
  if (reason) return NextResponse.json({ error: reason }, { status: 400 });

  // Prefijo por usuario: /register comprueba que el path pedido empiece con el
  // id de quien llama, así nadie registra un archivo ajeno.
  const normalizedName = normalizeUploadFileName(name, typeof type === "string" ? type : "");
  const ext = normalizedName.includes(".") ? normalizedName.slice(normalizedName.lastIndexOf(".")) : "";
  const path = `${user.id}/${crypto.randomUUID()}${ext}`;

  const service = createServiceClient();
  const { data, error } = await service.storage.from("chat-uploads").createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: "No se pudo preparar la subida" }, { status: 500 });
  }

  return NextResponse.json({ path: data.path, token: data.token });
}

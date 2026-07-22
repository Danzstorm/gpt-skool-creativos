import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { MAX_SIZE_BYTES, rejectReason } from "@/lib/upload-limits";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Descargar de Storage y volver a subir a OpenAI toma su tiempo con archivos
// grandes; el default de Vercel se queda corto. 300s = techo de Vercel Pro.
export const maxDuration = 300;

// Paso 2 de 2 de la subida de adjuntos (ver /api/upload/sign).
//
// El archivo ya está en Storage, subido por el navegador. Acá se copia a OpenAI
// para poder referenciarlo en el chat. El límite de 4.5MB de body no aplica: el
// archivo lo BAJA la función, no viene en la request.

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { path, name, type } = await request.json().catch(() => ({}));
  if (typeof path !== "string" || typeof name !== "string") {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  // /sign firma paths con el prefijo del usuario. Sin esta comprobación,
  // cualquiera podría registrar (y por tanto leer) el adjunto de otro miembro.
  if (!path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Petición inválida" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: blob, error } = await service.storage.from("chat-uploads").download(path);
  if (error || !blob) {
    return NextResponse.json({ error: "No se encontró el archivo subido" }, { status: 404 });
  }

  // El tamaño declarado en /sign lo puso el cliente; este es el real.
  const reason = rejectReason(typeof type === "string" ? type : "", blob.size);
  if (reason || blob.size > MAX_SIZE_BYTES) {
    await service.storage.from("chat-uploads").remove([path]);
    return NextResponse.json({ error: reason ?? "Archivo demasiado grande" }, { status: 400 });
  }

  const uploaded = await openai.files.create({
    file: new File([blob], name, { type: type || blob.type || "application/octet-stream" }),
    purpose: "user_data",
  });

  // El mapeo permite reconstruir las miniaturas al recargar el historial.
  // Best-effort, igual que antes: si falla, el chat funciona lo mismo.
  try {
    await service.from("uploaded_files").insert({
      openai_file_id: uploaded.id,
      user_id: user.id,
      storage_path: path,
      mime: type || null,
      name,
    });
  } catch {
    // ignorar fallos de persistencia
  }

  return NextResponse.json({ file_id: uploaded.id, name });
}

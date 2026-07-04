import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_SIZE_MB = 20;
const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "text/plain", "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/x-python", "application/javascript", "text/typescript",
];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Límite: 20 archivos por minuto por usuario (protege saldo/almacenamiento OpenAI)
  const rl = await checkRateLimit(`upload:${user.id}`, 20, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
  }

  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return NextResponse.json(
      { error: `El archivo supera el límite de ${MAX_SIZE_MB}MB` },
      { status: 400 }
    );
  }

  // Validar tipo: solo formatos soportados por Responses (evita subir binarios arbitrarios)
  if (file.type && !ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Tipo de archivo no permitido: ${file.type}` },
      { status: 400 }
    );
  }

  const uploaded = await openai.files.create({
    file,
    purpose: "user_data",
  });

  // Persistir copia en Storage + mapeo, para reconstruir miniaturas al recargar
  // el historial. Best-effort: si falla, el chat sigue funcionando igual.
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const path = `${user.id}/${uploaded.id}`;
    const service = createServiceClient();
    await service.storage
      .from("chat-uploads")
      .upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: true });
    await service.from("uploaded_files").insert({
      openai_file_id: uploaded.id,
      user_id: user.id,
      storage_path: path,
      mime: file.type,
      name: file.name,
    });
  } catch {
    // ignorar fallos de persistencia
  }

  return NextResponse.json({ file_id: uploaded.id, name: file.name });
}

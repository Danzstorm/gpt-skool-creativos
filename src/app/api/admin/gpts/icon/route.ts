import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { detectSupportedImageMime } from "@/lib/upload-file";

// Solo raster (png/jpeg/webp): SVG puede llevar scripts y el bucket es público.
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE_MB = 5;

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se recibió imagen" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return NextResponse.json({ error: `La imagen supera ${MAX_SIZE_MB}MB` }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // El `file.type` lo declara el navegador y se falsifica en un curl. Aquí se
  // ignora y manda el contenido real, igual que hace /api/upload/register: el
  // bucket `gpt-icons` es PÚBLICO, así que lo que se sirva desde él con un
  // Content-Type elegido por quien sube es exactamente lo que no queremos.
  const sniffed = detectSupportedImageMime(bytes);
  if (!sniffed || !ALLOWED_TYPES.includes(sniffed)) {
    return NextResponse.json(
      { error: "Formato no permitido. Usa PNG, JPEG o WEBP." },
      { status: 400 }
    );
  }

  const ext = sniffed.split("/")[1];
  const path = `${crypto.randomUUID()}.${ext}`;

  const service = createServiceClient();
  const { error } = await service.storage
    .from("gpt-icons")
    .upload(path, bytes, { contentType: sniffed, upsert: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = service.storage.from("gpt-icons").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}

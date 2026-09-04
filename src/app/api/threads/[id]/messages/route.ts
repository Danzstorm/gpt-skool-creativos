import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getThreadMessages } from "@/lib/openai-messages";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;

  const { data: thread, error } = await supabase
    .from("threads")
    .select("id")
    .eq("id", id)
    .single();

  if (error || !thread) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const messages = await getThreadMessages(supabase, id);

  // Resolver miniaturas de imágenes/documentos desde Storage (URLs firmadas), en paralelo.
  // El thread ya se validó como del usuario (RLS arriba); firmamos con service role.
  const fileIds = messages.flatMap((m) => m.files?.map((f) => f.openai_file_id) ?? []);
  if (fileIds.length > 0) {
    const service = createServiceClient();
    const { data: rows } = await service
      .from("uploaded_files")
      .select("openai_file_id, storage_path, name")
      .eq("user_id", user.id)
      .in("openai_file_id", fileIds);
    const map = new Map((rows ?? []).map((r) => [r.openai_file_id, r]));

    const targets = messages.flatMap((m) => m.files ?? []);
    await Promise.all(
      targets.map(async (f) => {
        const row = map.get(f.openai_file_id);
        if (!row) return;
        const { data: signed } = await service.storage
          .from("chat-uploads")
          .createSignedUrl(row.storage_path, 3600);
        if (signed?.signedUrl) f.previewUrl = signed.signedUrl;
        // Solo los documentos recuperan su nombre real. Para las imágenes esto
        // devolvía el nombre del archivo del dispositivo, que es justamente el
        // que no queremos ver: al recargar la conversación reaparecía algo como
        // "mt.data.image23490.png" debajo de la miniatura. Su etiqueta se
        // deriva de la posición, igual que en el composer.
        if (row.name && f.type === "document") f.name = row.name;
      })
    );
  }

  return NextResponse.json(messages);
}

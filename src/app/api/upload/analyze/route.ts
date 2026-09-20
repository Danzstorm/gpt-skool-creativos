import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { analyzeOwnedVideo } from "@/lib/video-analyze";

export const maxDuration = 300;

// Análisis Gemini en segundo plano. /register ya dejó el video adjunto;
// esta ruta rellena video_description para el prompt.

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rl = await checkRateLimit(`upload-analyze:${user.id}`, 10, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  const { file_id: fileId } = await request.json().catch(() => ({}));
  if (typeof fileId !== "string" || !fileId.startsWith("video_")) {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const result = await analyzeOwnedVideo(createServiceClient(), user.id, fileId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ description: result.description, alreadyReady: result.alreadyReady });
}

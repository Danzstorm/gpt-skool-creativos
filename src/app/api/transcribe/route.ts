import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_AUDIO_MB = 25; // límite de Whisper

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Límite: 20 transcripciones por minuto por usuario
  const rl = await checkRateLimit(`transcribe:${user.id}`, 20, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  const formData = await request.formData();
  const audio = formData.get("audio") as File | null;

  if (!audio) {
    return NextResponse.json({ error: "No se recibió audio" }, { status: 400 });
  }

  if (audio.size > MAX_AUDIO_MB * 1024 * 1024) {
    return NextResponse.json(
      { error: `El audio supera el límite de ${MAX_AUDIO_MB}MB` },
      { status: 400 }
    );
  }

  const transcription = await openai.audio.transcriptions.create({
    file: audio,
    model: "whisper-1",
    language: "es",
  });

  return NextResponse.json({ text: transcription.text });
}

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { audioCost } from "@/lib/pricing";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_AUDIO_MB = 25; // límite de Whisper
const MODEL = "whisper-1";

// Tope de gasto de transcripción por usuario y día, en USD. A $0.006/minuto son
// unos 60 minutos de audio diarios: de sobra para dictar mensajes, y un techo
// duro para el caso en que alguien automatice la ruta.
//
// Por qué hacía falta: esta ruta aceptaba 20 peticiones por minuto de hasta 25MB
// cada una, y 25MB de opus son ~2 horas de audio (~$0.72). O sea ~$14 por minuto
// de gasto posible, sobre la cuenta de OpenAI del cliente. Y era invisible: la
// cuota mensual cuenta filas de `messages` con role='assistant' (aquí no se crea
// ninguna) y el panel de admin agrega `usage_events` (aquí no se escribía nada).
const MAX_AUDIO_USD_PER_DAY = 0.36;

// Se reutiliza el bucket de fecha del panel: día natural UTC.
function startOfDayIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Límite: 10 transcripciones por minuto por usuario. Una persona dictando no
  // pasa de dos o tres; lo que había (20) solo servía para automatizar gasto.
  const rl = await checkRateLimit(`transcribe:${user.id}`, 10, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  const serviceClient = createServiceClient();

  // Presupuesto diario. Se lee antes de llamar a OpenAI y se calcula sobre lo ya
  // registrado, así que el último audio del día puede pasarse un poco del tope:
  // se acepta a cambio de no bloquear un dictado a medias.
  const { data: spentToday } = await serviceClient
    .from("usage_events")
    .select("cost")
    .eq("user_id", user.id)
    .eq("model", MODEL)
    .gte("created_at", startOfDayIso());

  const spent = (spentToday ?? []).reduce((sum, row) => sum + Number(row.cost ?? 0), 0);
  if (spent >= MAX_AUDIO_USD_PER_DAY) {
    return NextResponse.json(
      { error: "Alcanzaste el límite de transcripción de audio de hoy. Vuelve a intentarlo mañana." },
      { status: 429 }
    );
  }

  // formData() lanza con un body malformado; sin el try esto era un 500 y una
  // promesa rechazada sin capturar.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const audio = formData.get("audio");

  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "No se recibió audio" }, { status: 400 });
  }

  if (audio.size > MAX_AUDIO_MB * 1024 * 1024) {
    return NextResponse.json(
      { error: `El audio supera el límite de ${MAX_AUDIO_MB}MB` },
      { status: 400 }
    );
  }

  // verbose_json en vez de json: trae `duration` en segundos, que es lo que
  // OpenAI factura. Con eso el costo que se registra es exacto, no estimado.
  const transcription = await openai.audio.transcriptions.create({
    file: audio,
    model: MODEL,
    language: "es",
    response_format: "verbose_json",
  });

  // Registro best-effort: el gasto de audio tiene que verse en el panel de admin
  // junto al del chat. gpt_id y thread_id quedan en null (una transcripción no
  // pertenece a ningún GPT ni conversación) y la columna los admite.
  const { error: usageError } = await serviceClient.from("usage_events").insert({
    user_id: user.id,
    gpt_id: null,
    thread_id: null,
    model: MODEL,
    tokens_in: null,
    tokens_out: null,
    cost: audioCost(transcription.duration ?? 0),
  });
  if (usageError) {
    console.error("transcribe usage log error", {
      code: usageError.code,
      message: usageError.message,
    });
  }

  return NextResponse.json({ text: transcription.text });
}

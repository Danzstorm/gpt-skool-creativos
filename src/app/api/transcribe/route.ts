import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { audioCost, worstCaseAudioCost } from "@/lib/pricing";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = "whisper-1";

// 10MB son ~28 minutos de audio al bitrate que produce MediaRecorder en el
// navegador: de sobra para dictar un mensaje. El tope de Whisper es 25MB, pero
// aceptar 25MB solo servía para que un archivo hecho a mano a bitrate mínimo
// costase varios dólares en una sola petición.
const MAX_AUDIO_MB = 10;

// Presupuesto diario de transcripción por usuario, en USD. A $0.006/minuto son
// unos 100 minutos de audio al día.
//
// Por qué existe: esta ruta aceptaba 20 peticiones por minuto de hasta 25MB
// cada una, sin cuota y sin dejar rastro. La cuota mensual cuenta filas de
// `messages` con role='assistant' (aquí no se crea ninguna) y el panel de admin
// agrega `usage_events` (aquí no se escribía nada), así que el gasto de Whisper
// sobre la cuenta de OpenAI del cliente era ilimitado E invisible.
const MAX_AUDIO_USD_PER_DAY = 0.6;

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

  // Guarda de ráfaga, no el presupuesto: sin Upstash configurado el limitador
  // es por instancia, así que en serverless no acota nada global. El tope real
  // de gasto es el de más abajo, que vive en la base.
  const rl = await checkRateLimit(`transcribe:${user.id}`, 10, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

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

  const serviceClient = createServiceClient();

  // RESERVAR, LUEGO VERIFICAR. El orden importa y es lo único que hace que el
  // tope aguante peticiones simultáneas.
  //
  // Leer primero el gasto y decidir después es comprobar-y-actuar: dos
  // peticiones a la vez leen el mismo total, las dos pasan, y el tope se salta
  // por tantas veces como concurrencia haya. Escribiendo PRIMERO una fila con
  // el coste máximo posible para este archivo, la suma que viene después ya
  // incluye las reservas de todas las peticiones en vuelo, porque `usage_events`
  // es estado compartido y no memoria de una instancia. Si dos entran a la vez
  // y el total se pasa, las dos abortan y sueltan su reserva: se rechaza de más,
  // nunca se gasta de más. Ese es el lado seguro del error.
  const { data: reservation, error: reservationError } = await serviceClient
    .from("usage_events")
    .insert({
      user_id: user.id,
      gpt_id: null,
      thread_id: null,
      model: MODEL,
      tokens_in: null,
      tokens_out: null,
      cost: worstCaseAudioCost(audio.size),
    })
    .select("id")
    .single();

  if (reservationError || !reservation) {
    console.error("transcribe reservation failed", {
      code: reservationError?.code,
      message: reservationError?.message,
    });
    return NextResponse.json(
      { error: "No se pudo verificar tu cuota de audio. Inténtalo de nuevo en un momento." },
      { status: 503 }
    );
  }

  const releaseReservation = async () => {
    const { error } = await serviceClient.from("usage_events").delete().eq("id", reservation.id);
    if (error) {
      // Queda una reserva de más contra el presupuesto del día. Es el lado
      // seguro (cobra de más, no de menos) pero hay que poder verlo.
      console.error("transcribe reservation release failed", {
        id: reservation.id,
        code: error.code,
        message: error.message,
      });
    }
  };

  // Fail-closed: si no se puede saber cuánto se lleva gastado, NO se gasta más.
  // Tragarse este error convertía el tope en decorativo, porque una consulta
  // fallida se leía como "gasto cero" y dejaba pasar todo.
  const { data: spentToday, error: ledgerError } = await serviceClient
    .from("usage_events")
    .select("cost")
    .eq("user_id", user.id)
    .eq("model", MODEL)
    .gte("created_at", startOfDayIso());

  if (ledgerError || !spentToday) {
    console.error("transcribe budget read failed", {
      code: ledgerError?.code,
      message: ledgerError?.message,
    });
    await releaseReservation();
    return NextResponse.json(
      { error: "No se pudo verificar tu cuota de audio. Inténtalo de nuevo en un momento." },
      { status: 503 }
    );
  }

  // La suma ya incluye la reserva propia y la de cualquier petición simultánea.
  const spent = spentToday.reduce((sum, row) => sum + Number(row.cost ?? 0), 0);
  if (spent > MAX_AUDIO_USD_PER_DAY) {
    await releaseReservation();
    return NextResponse.json(
      { error: "Alcanzaste el límite de transcripción de audio de hoy. Vuelve a intentarlo mañana." },
      { status: 429 }
    );
  }

  let transcription;
  try {
    // verbose_json en vez de json: trae `duration` en segundos, que es lo que
    // OpenAI factura. Con eso el coste que queda registrado es exacto.
    transcription = await openai.audio.transcriptions.create({
      file: audio,
      model: MODEL,
      language: "es",
      response_format: "verbose_json",
    });
  } catch (error) {
    // No hubo transcripción: se suelta la reserva para no cobrar un gasto que
    // no ocurrió.
    await releaseReservation();
    throw error;
  }

  // Se ajusta la reserva al coste real, casi siempre bastante menor que el peor
  // caso reservado.
  const { error: usageError } = await serviceClient
    .from("usage_events")
    .update({ cost: audioCost(transcription.duration ?? 0) })
    .eq("id", reservation.id);

  if (usageError) {
    // Se deja la reserva tal cual: sobreestima el gasto del día, que otra vez es
    // el lado seguro.
    console.error("transcribe usage reconcile error", {
      code: usageError.code,
      message: usageError.message,
    });
  }

  return NextResponse.json({ text: transcription.text });
}

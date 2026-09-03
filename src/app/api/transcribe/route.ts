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

// Dos topes que hacen cosas distintas y se necesitan los dos:
//
// - MAX_TRANSCRIPTIONS_PER_DAY es ATÓMICO (lo cuenta el rate limiter, que
//   incrementa antes de trabajar), así que acota el peor caso aunque lleguen
//   mil peticiones a la vez. Es el techo duro.
// - MAX_AUDIO_USD_PER_DAY es contable: más ajustado en uso normal, pero se
//   calcula leyendo lo ya registrado, así que por sí solo NO resiste
//   concurrencia. Por eso el gasto se reserva antes de llamar a OpenAI (ver
//   abajo) y por eso existe el tope atómico encima.
const MAX_TRANSCRIPTIONS_PER_DAY = 40;
const MAX_AUDIO_USD_PER_DAY = 0.6; // ~100 minutos de audio al día

const DAY_MS = 24 * 60 * 60 * 1000;

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

  // Ráfaga. Una persona dictando no pasa de dos o tres por minuto.
  const rl = await checkRateLimit(`transcribe:${user.id}`, 10, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  // Techo diario atómico. Va antes que cualquier lectura de la base: es el
  // único de los dos topes que no tiene ventana de carrera.
  const daily = await checkRateLimit(`transcribe:day:${user.id}`, MAX_TRANSCRIPTIONS_PER_DAY, DAY_MS);
  if (!daily.ok) return rateLimitResponse(daily);

  const serviceClient = createServiceClient();

  // Fail-closed: si no se puede saber cuánto se lleva gastado, NO se gasta más.
  // Tragarse el error aquí convertía el tope en decorativo, porque un fallo de
  // la consulta se leía como "gasto cero" y dejaba pasar todo.
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
    return NextResponse.json(
      { error: "No se pudo verificar tu cuota de audio. Inténtalo de nuevo en un momento." },
      { status: 503 }
    );
  }

  const spent = spentToday.reduce((sum, row) => sum + Number(row.cost ?? 0), 0);
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

  // Reserva antes de gastar. La llamada a Whisper tarda segundos y durante ese
  // rato el ledger no reflejaba nada: varias peticiones simultáneas leían el
  // mismo total y pasaban todas. Escribiendo primero una fila con el coste
  // MÁXIMO posible para este tamaño, la siguiente petición ya la ve. La ventana
  // de carrera baja del tiempo de la transcripción al de este insert, y lo que
  // quede sin cubrir lo acota el tope atómico de arriba.
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
    // La transcripción no llegó a producirse: se suelta la reserva para no
    // cobrarle al usuario un gasto que no ocurrió. El slot del tope diario
    // atómico sí queda consumido, así que reintentar en bucle sigue acotado.
    await serviceClient.from("usage_events").delete().eq("id", reservation.id);
    throw error;
  }

  // Se ajusta la reserva al coste real, casi siempre bastante menor que el peor
  // caso reservado.
  const { error: usageError } = await serviceClient
    .from("usage_events")
    .update({ cost: audioCost(transcription.duration ?? 0) })
    .eq("id", reservation.id);

  if (usageError) {
    // Se deja la reserva tal cual: sobreestima el gasto del día, que es el lado
    // seguro del error.
    console.error("transcribe usage reconcile error", {
      code: usageError.code,
      message: usageError.message,
    });
  }

  return NextResponse.json({ text: transcription.text });
}

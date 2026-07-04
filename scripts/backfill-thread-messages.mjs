// One-time (re-ejecutable) backfill: copia el historial completo de cada thread
// de OpenAI (Assistants API) hacia la tabla local `messages` en Supabase.
// Necesario antes de que OpenAI apague la Assistants API (2026-08-26) — después
// de esa fecha los threads legacy son irrecuperables.
//
// Resincroniza SIEMPRE el historial completo de cada thread (borra + reinserta
// local), así que es seguro re-ejecutarlo varias veces hasta el cutover para
// capturar mensajes nuevos enviados mientras la migración de código está en curso.
// Ejecutar una última vez justo antes del deploy final.
//
// Uso: node --env-file=.env.local scripts/backfill-thread-messages.mjs

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapMessage(msg, threadId, userId) {
  const text = msg.content
    .filter((c) => c.type === "text")
    .map((c) => c.text.value)
    .join("\n");

  const imageFiles = msg.content
    .filter((c) => c.type === "image_file")
    .map((c) => ({ openai_file_id: c.image_file.file_id, type: "image" }));

  if (!text.trim() && imageFiles.length === 0) return null;

  return {
    thread_id: threadId,
    user_id: userId,
    role: msg.role === "assistant" ? "assistant" : "user",
    content: text,
    files: imageFiles.length > 0 ? imageFiles : null,
    created_at: new Date(msg.created_at * 1000).toISOString(),
  };
}

async function backfillThread(thread) {
  const rows = [];
  for await (const msg of openai.beta.threads.messages.list(thread.openai_thread_id, { order: "asc", limit: 100 })) {
    const row = mapMessage(msg, thread.id, thread.user_id);
    if (row) rows.push(row);
  }

  const { error: deleteError } = await supabase.from("messages").delete().eq("thread_id", thread.id);
  if (deleteError) throw deleteError;

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("messages").insert(rows);
    if (insertError) throw insertError;
  }

  const { error: updateError } = await supabase
    .from("threads")
    .update({ migrated_at: new Date().toISOString() })
    .eq("id", thread.id);
  if (updateError) throw updateError;

  return rows.length;
}

async function main() {
  const { data: threads, error } = await supabase
    .from("threads")
    .select("id, user_id, openai_thread_id")
    .not("openai_thread_id", "is", null);

  if (error) throw error;

  console.log(`Encontrados ${threads.length} threads legacy con openai_thread_id.`);

  let ok = 0;
  let failed = 0;
  let totalMessages = 0;

  for (const thread of threads) {
    try {
      const count = await backfillThread(thread);
      totalMessages += count;
      ok++;
      console.log(`OK  thread ${thread.id} -> ${count} mensajes`);
    } catch (err) {
      failed++;
      console.error(`FALLO thread ${thread.id}:`, err instanceof Error ? err.message : err);
    }
    await sleep(150); // evitar ráfagas contra el rate limit de OpenAI
  }

  console.log(`\nCompletado: ${ok} threads ok (${totalMessages} mensajes), ${failed} fallidos de ${threads.length}.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

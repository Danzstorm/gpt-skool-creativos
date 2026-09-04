// Limpia archivos huérfanos: uploaded_files (+ su copia en Storage y el archivo
// en OpenAI) que ya no está referenciado por ningún mensaje. Pasa esto cuando
// se borran threads/mensajes (editar, regenerar, borrar conversación) — el
// archivo subido no se borra automáticamente en esos flujos.
//
// Uso: node --env-file=.env.local scripts/cleanup-orphans.mjs [--dry-run] [--keep-days=N]
//
// Los archivos recientes NO se borran aunque hayan quedado sin mensaje: desde
// que el composer tiene biblioteca (`@`), un archivo sin mensaje ya no es
// necesariamente basura — puede ser algo que la persona espera reusar y cuya
// conversación borró.

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { DEFAULT_KEEP_DAYS, selectOrphans } from "./lib/orphan-files.mjs";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const dryRun = process.argv.includes("--dry-run");
const keepDaysArg = process.argv.find((a) => a.startsWith("--keep-days="));
const keepDays = keepDaysArg ? Number(keepDaysArg.split("=")[1]) : DEFAULT_KEEP_DAYS;
if (!Number.isFinite(keepDays) || keepDays < 0) {
  console.error("--keep-days tiene que ser un número de días >= 0");
  process.exit(1);
}

async function main() {
  const { data: uploaded, error: uploadedError } = await supabase
    .from("uploaded_files")
    .select("openai_file_id, storage_path, created_at");
  if (uploadedError) throw uploadedError;

  const { data: messages, error: messagesError } = await supabase.from("messages").select("files");
  if (messagesError) throw messagesError;

  const referenced = new Set();
  for (const m of messages) {
    for (const f of m.files ?? []) {
      if (f?.openai_file_id) referenced.add(f.openai_file_id);
    }
  }

  const orphans = selectOrphans(uploaded, referenced, keepDays);
  const sinReferencia = uploaded.filter((u) => !referenced.has(u.openai_file_id)).length;
  console.log(
    `${uploaded.length} archivos subidos, ${referenced.size} referenciados, ` +
      `${sinReferencia} sin mensaje, ${orphans.length} borrables ` +
      `(los otros ${sinReferencia - orphans.length} son de los últimos ${keepDays} días).`
  );

  if (dryRun) {
    for (const o of orphans) console.log(`[dry-run] borraría ${o.openai_file_id} (${o.storage_path})`);
    return;
  }

  let ok = 0;
  let failed = 0;

  for (const o of orphans) {
    try {
      await supabase.storage.from("chat-uploads").remove([o.storage_path]);
      try {
        await openai.files.delete(o.openai_file_id);
      } catch {
        // ya pudo haber sido borrado en OpenAI antes; no bloquea la limpieza local
      }
      const { error } = await supabase.from("uploaded_files").delete().eq("openai_file_id", o.openai_file_id);
      if (error) throw error;
      ok++;
    } catch (err) {
      failed++;
      console.error(`FALLO ${o.openai_file_id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nCompletado: ${ok} borrados, ${failed} fallidos de ${orphans.length}.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Limpia archivos que se subieron y NUNCA se mandaron: quedan en
// uploaded_files (+ su copia en Storage y el archivo en OpenAI) ocupando lugar
// sin haber llegado a ningún mensaje. Pasa cuando alguien adjunta algo y cierra
// la pestaña sin enviar.
//
// Lo que NO borra: nada que se haya enviado alguna vez. Eso es la biblioteca
// del usuario, la que alimenta el menú `@` del composer, y sigue siendo suya
// aunque haya borrado la conversación donde la mandó.
//
// Uso: node --env-file=.env.local scripts/cleanup-orphans.mjs [--dry-run] [--keep-days=N]

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { DEFAULT_KEEP_DAYS, selectOrphans } from "./lib/orphan-files.mjs";
import { fetchAllRows } from "./lib/fetch-all.mjs";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const dryRun = process.argv.includes("--dry-run");
const keepDaysArg = process.argv.find((a) => a.startsWith("--keep-days="));
const keepDays = keepDaysArg ? Number(keepDaysArg.split("=")[1]) : DEFAULT_KEEP_DAYS;
if (!Number.isFinite(keepDays) || keepDays < 0) {
  console.error("--keep-days tiene que ser un número de días >= 0");
  process.exit(1);
}

/**
 * ¿Sigue siendo basura JUSTO AHORA?
 *
 * Entre que se arma la lista y se llega a borrar pasan segundos o minutos, y en
 * ese rato alguien puede haber elegido ese mismo archivo desde el menú `@` y
 * haberlo mandado. Sin esta re-comprobación, la limpieza borra un archivo que
 * se acaba de usar. Son dos consultas por candidato, y se pagan de buena gana:
 * los candidatos son pocos y el borrado no se puede deshacer.
 */
async function sigueSiendoBasura(fileId) {
  const { data: row, error } = await supabase
    .from("uploaded_files")
    .select("attached_at")
    .eq("openai_file_id", fileId)
    .maybeSingle();
  if (error) throw error;
  // Ya no está: alguien lo borró en el medio. Nada que hacer.
  if (!row) return false;
  if (row.attached_at) return false;

  const { data: usos, error: usosError } = await supabase
    .from("messages")
    .select("id")
    .contains("files", [{ openai_file_id: fileId }])
    .limit(1);
  if (usosError) throw usosError;
  return (usos ?? []).length === 0;
}

async function main() {
  let uploaded;
  try {
    uploaded = await fetchAllRows((from, to) =>
      supabase
        .from("uploaded_files")
        .select("openai_file_id, storage_path, created_at, attached_at")
        .order("created_at", { ascending: true })
        .range(from, to)
    );
  } catch (error) {
    // Sin la columna, la única forma de decidir sería la vieja —por
    // alcanzabilidad— y esa borra biblioteca legítima. Se prefiere no correr
    // antes que borrar de más: lo de enfrente es irreversible.
    if (error?.code === "42703" || /attached_at/.test(error?.message ?? "")) {
      console.error(
        [
          "Falta la columna uploaded_files.attached_at.",
          "Aplica la migración 20260904040000_uploaded_files_attached_at.sql (supabase db push)",
          "antes de correr esta limpieza.",
        ].join(" ")
      );
      process.exit(1);
    }
    throw error;
  }

  // Segunda señal, independiente de attached_at: si algún mensaje todavía
  // apunta al archivo, se envió — aunque la marca no se haya llegado a
  // escribir. Se piden las dos porque fallan de formas distintas.
  //
  // Paginado: sin esto PostgREST devolvía solo los primeros 1000 mensajes y el
  // set quedaba incompleto, así que archivos enviados figuraban como no
  // referenciados.
  const messages = await fetchAllRows((from, to) =>
    supabase.from("messages").select("id, files").order("id", { ascending: true }).range(from, to)
  );

  const referenced = new Set();
  for (const m of messages) {
    for (const f of m.files ?? []) {
      if (f?.openai_file_id) referenced.add(f.openai_file_id);
    }
  }

  const enviados = uploaded.filter((u) => u.attached_at || referenced.has(u.openai_file_id)).length;
  const orphans = selectOrphans(uploaded, referenced, keepDays);
  const nuncaEnviados = uploaded.length - enviados;
  console.log(
    `${uploaded.length} archivos subidos, ${messages.length} mensajes revisados, ` +
      `${enviados} enviados alguna vez (biblioteca, intocables), ` +
      `${nuncaEnviados} nunca enviados, ${orphans.length} borrables ` +
      `(los otros ${nuncaEnviados - orphans.length} son de los últimos ${keepDays} días).`
  );

  if (dryRun) {
    for (const o of orphans) console.log(`[dry-run] borraría ${o.openai_file_id} (${o.storage_path})`);
    return;
  }

  let ok = 0;
  let failed = 0;
  let salvados = 0;

  for (const o of orphans) {
    try {
      if (!(await sigueSiendoBasura(o.openai_file_id))) {
        salvados++;
        console.log(`omitido ${o.openai_file_id}: se usó mientras corría la limpieza.`);
        continue;
      }
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

  console.log(
    `\nCompletado: ${ok} borrados, ${salvados} omitidos por uso concurrente, ` +
      `${failed} fallidos de ${orphans.length}.`
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

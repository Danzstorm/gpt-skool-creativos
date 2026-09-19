// Limpia dos clases de basura de Storage, y NUNCA la biblioteca:
//
//   1. Filas de uploaded_files que se subieron y NUNCA se mandaron (composer
//      cerrado sin Enviar). También borra su copia en Storage y, si existe,
//      el archivo en OpenAI.
//   2. Blobs de chat-uploads sin fila en uploaded_files: PUT a la URL firmada
//      que /register no llegó a mapear. Solo se toca Storage.
//
// Lo que NO borra: nada que se haya enviado alguna vez. Eso es la biblioteca
// del usuario (aunque el menú `@` ahora sea por hilo), y sigue siendo suya
// aunque haya borrado la conversación donde la mandó.
//
// Por defecto SOLO INFORMA. Hay que pasar --confirm para borrar.
//
// Uso:
//   node --env-file=.env.local scripts/cleanup-orphans.mjs
//   node --env-file=.env.local scripts/cleanup-orphans.mjs --confirm
//   node --env-file=.env.local scripts/cleanup-orphans.mjs --keep-days=30 --keep-unregistered-days=7

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import {
  DEFAULT_KEEP_DAYS,
  DEFAULT_UNREGISTERED_KEEP_DAYS,
  formatBytes,
  selectOrphans,
  selectUnregisteredBlobs,
  summarizeBytes,
} from "./lib/orphan-files.mjs";
import { fetchAllRows } from "./lib/fetch-all.mjs";
import { listChatUploadObjects, sizeByPath } from "./lib/storage-list.mjs";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const confirm = process.argv.includes("--confirm");
const dryRun = !confirm;
const keepDaysArg = process.argv.find((a) => a.startsWith("--keep-days="));
const keepDays = keepDaysArg ? Number(keepDaysArg.split("=")[1]) : DEFAULT_KEEP_DAYS;
const unregDaysArg = process.argv.find((a) => a.startsWith("--keep-unregistered-days="));
const unregisteredKeepDays = unregDaysArg
  ? Number(unregDaysArg.split("=")[1])
  : DEFAULT_UNREGISTERED_KEEP_DAYS;

if (!Number.isFinite(keepDays) || keepDays < 0) {
  console.error("--keep-days tiene que ser un número de días >= 0");
  process.exit(1);
}
if (!Number.isFinite(unregisteredKeepDays) || unregisteredKeepDays < 0) {
  console.error("--keep-unregistered-days tiene que ser un número de días >= 0");
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

async function sigueSinRegistrar(storagePath) {
  const { data, error } = await supabase
    .from("uploaded_files")
    .select("openai_file_id")
    .eq("storage_path", storagePath)
    .maybeSingle();
  if (error) throw error;
  return !data;
}

function printByteSummary(label, rows) {
  const summary = summarizeBytes(rows);
  const measured = formatBytes(summary.knownBytes);
  const unknown =
    summary.unknown > 0 ? ` (${summary.unknown} sin tamaño medido)` : "";
  console.log(`${label}: ${summary.count} archivos, ${measured} medidos${unknown}`);
  return summary;
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

  const messages = await fetchAllRows((from, to) =>
    supabase.from("messages").select("id, files").order("id", { ascending: true }).range(from, to)
  );

  const referenced = new Set();
  for (const m of messages) {
    for (const f of m.files ?? []) {
      if (f?.openai_file_id) referenced.add(f.openai_file_id);
    }
  }

  const listed = await listChatUploadObjects(supabase);
  if (listed.error) {
    console.warn(`No se pudo listar Storage (${listed.error}). El informe de GB y los blobs sin registrar quedan incompletos.`);
  } else {
    console.log(`Storage: ${listed.objects.length} objetos en chat-uploads (vía ${listed.source}).`);
  }
  const sizes = sizeByPath(listed.objects);

  const enviados = uploaded.filter((u) => u.attached_at || referenced.has(u.openai_file_id)).length;
  const orphans = selectOrphans(uploaded, referenced, keepDays).map((file) => ({
    ...file,
    bytes: sizes.get(file.storage_path) ?? null,
  }));
  const nuncaEnviados = uploaded.length - enviados;

  console.log(
    `${uploaded.length} archivos subidos, ${messages.length} mensajes revisados, ` +
      `${enviados} enviados alguna vez (biblioteca, intocables), ` +
      `${nuncaEnviados} nunca enviados, ${orphans.length} borrables ` +
      `(los otros ${nuncaEnviados - orphans.length} son de los últimos ${keepDays} días).`
  );
  printByteSummary(`Huérfanos nunca enviados (>${keepDays}d)`, orphans);

  const registeredPaths = new Set(uploaded.map((file) => file.storage_path).filter(Boolean));
  const unregistered = listed.objects.length
    ? selectUnregisteredBlobs(listed.objects, registeredPaths, unregisteredKeepDays)
    : [];
  printByteSummary(`Blobs sin registrar (>${unregisteredKeepDays}d)`, unregistered);

  if (dryRun) {
    for (const o of orphans) {
      console.log(`[dry-run] borraría ${o.openai_file_id} (${o.storage_path}, ${formatBytes(o.bytes)})`);
    }
    for (const blob of unregistered) {
      console.log(`[dry-run] blob sin registro ${blob.name} (${formatBytes(blob.bytes)})`);
    }
    console.log("\nNada borrado. Repite con --confirm para aplicar.");
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

  let unregOk = 0;
  let unregFailed = 0;
  let unregSalvados = 0;
  for (const blob of unregistered) {
    try {
      if (!(await sigueSinRegistrar(blob.name))) {
        unregSalvados++;
        console.log(`omitido ${blob.name}: se registró mientras corría la limpieza.`);
        continue;
      }
      const { error } = await supabase.storage.from("chat-uploads").remove([blob.name]);
      if (error) throw error;
      unregOk++;
    } catch (err) {
      unregFailed++;
      console.error(`FALLO blob ${blob.name}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `\nCompletado: ${ok} huérfanos borrados, ${salvados} omitidos por uso concurrente, ` +
      `${failed} fallidos de ${orphans.length}.`
  );
  console.log(
    `Blobs sin registrar: ${unregOk} borrados, ${unregSalvados} omitidos, ` +
      `${unregFailed} fallidos de ${unregistered.length}.`
  );
  if (failed > 0 || unregFailed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

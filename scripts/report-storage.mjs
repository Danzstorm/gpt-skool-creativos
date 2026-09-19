// Informe de solo lectura: cómo está el Storage y quién lo usa.
// No borra nada. Para candidatos a limpieza, ver cleanup-orphans.mjs.
//
// Uso: node --env-file=.env.local scripts/report-storage.mjs [--inactive-months=6]

import { createClient } from "@supabase/supabase-js";
import { fetchAllRows } from "./lib/fetch-all.mjs";
import {
  DEFAULT_KEEP_DAYS,
  DEFAULT_UNREGISTERED_KEEP_DAYS,
  formatBytes,
  selectOrphans,
  selectUnregisteredBlobs,
  summarizeBytes,
} from "./lib/orphan-files.mjs";
import { listChatUploadObjects, sizeByPath } from "./lib/storage-list.mjs";
import {
  DEFAULT_INACTIVE_MONTHS,
  aggregateFiles,
  classifyMembers,
  lastActivityByUser,
} from "./lib/storage-report.mjs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const inactiveArg = process.argv.find((a) => a.startsWith("--inactive-months="));
const inactiveMonths = inactiveArg ? Number(inactiveArg.split("=")[1]) : DEFAULT_INACTIVE_MONTHS;
if (!Number.isFinite(inactiveMonths) || inactiveMonths < 0) {
  console.error("--inactive-months tiene que ser un número >= 0");
  process.exit(1);
}

function printCounts(title, counts) {
  console.log(title);
  for (const [key, value] of Object.entries(counts)) {
    console.log(`  ${key}: ${value}`);
  }
}

async function main() {
  const [uploaded, messages, members, profiles, threads, usage] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("uploaded_files")
        .select("openai_file_id, user_id, storage_path, mime, created_at, attached_at")
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabase.from("messages").select("id, files, content").order("id", { ascending: true }).range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("allowed_members")
        .select("email, is_active")
        .order("email", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabase.from("profiles").select("id, email, created_at").order("id", { ascending: true }).range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("threads")
        .select("user_id, updated_at")
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("usage_events")
        .select("user_id, created_at")
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  const listed = await listChatUploadObjects(supabase);
  if (listed.error) {
    console.warn(`Storage no listable (${listed.error}). Los GB son incompletos.`);
  }
  const sizes = sizeByPath(listed.objects);
  const files = uploaded.map((file) => ({
    ...file,
    bytes: sizes.get(file.storage_path) ?? null,
  }));

  const referenced = new Set();
  let messageChars = 0;
  for (const message of messages) {
    messageChars += String(message.content ?? "").length;
    for (const file of message.files ?? []) {
      if (file?.openai_file_id) referenced.add(file.openai_file_id);
    }
  }

  const now = Date.now();
  const agg = aggregateFiles(files, now);
  const orphans = selectOrphans(files, referenced, DEFAULT_KEEP_DAYS, now);
  const registeredPaths = new Set(files.map((file) => file.storage_path).filter(Boolean));
  const unregistered = listed.objects.length
    ? selectUnregisteredBlobs(listed.objects, registeredPaths, DEFAULT_UNREGISTERED_KEEP_DAYS, now)
    : [];

  const emailById = new Map(
    profiles.map((profile) => [profile.id, String(profile.email ?? "").toLowerCase().trim()])
  );
  const activity = lastActivityByUser([
    ...profiles.map((row) => ({ user_id: row.id, at: row.created_at })),
    ...threads.map((row) => ({ user_id: row.user_id, at: row.updated_at })),
    ...usage.map((row) => ({ user_id: row.user_id, at: row.created_at })),
    ...files.map((row) => ({ user_id: row.user_id, at: row.created_at })),
  ]);
  const membersReport = classifyMembers({
    members,
    profiles,
    lastActivityMsByUserId: activity,
    now,
    inactiveMonths,
  });

  const fileBytes = summarizeBytes(files);
  const orphanBytes = summarizeBytes(orphans);
  const unregBytes = summarizeBytes(unregistered);
  const bucketBytes = summarizeBytes(listed.objects);

  console.log("=== Storage (solo lectura) ===");
  console.log(`Generado: ${new Date().toISOString()}`);
  console.log(`Bucket chat-uploads: ${listed.objects.length} objetos vía ${listed.source}, ${formatBytes(bucketBytes.knownBytes)}`);
  console.log(`uploaded_files: ${files.length} filas, ${formatBytes(fileBytes.knownBytes)} medidos (${fileBytes.unknown} sin tamaño)`);
  console.log(`Mensajes: ${messages.length}, texto ~${formatBytes(messageChars)} (no es el techo)`);
  printCounts("Por tipo:", agg.byKind);
  printCounts("Por antigüedad:", agg.byAge);
  console.log(`Enviados alguna vez (biblioteca): ${agg.attached}`);
  console.log(`Nunca enviados: ${agg.unattached}`);
  console.log(
    `Recolectable hoy (nunca enviados >${DEFAULT_KEEP_DAYS}d): ${orphans.length}, ${formatBytes(orphanBytes.knownBytes)}` +
      (orphanBytes.unknown ? ` (${orphanBytes.unknown} sin tamaño)` : "")
  );
  console.log(
    `Blobs sin registrar >${DEFAULT_UNREGISTERED_KEEP_DAYS}d: ${unregistered.length}, ${formatBytes(unregBytes.knownBytes)}`
  );

  console.log("\n=== Top 15 usuarios por nº de archivos ===");
  for (const row of agg.topUsers.slice(0, 15)) {
    const email = emailById.get(row.user_id) || row.user_id;
    console.log(
      `  ${email}  ${row.count} archivos (${row.attached} enviados / ${row.unattached} no), ${formatBytes(row.knownBytes)}`
    );
  }

  console.log("\n=== Miembros (Skool whitelist, no se borra nada) ===");
  console.log(`allowed_members: ${members.length} (${members.filter((m) => m.is_active).length} activos)`);
  console.log(`profiles: ${profiles.length}`);
  console.log(`Revocados (is_active=false): ${membersReport.revoked.length}`);
  console.log(`Activos que nunca entraron a la web: ${membersReport.neverEntered.length}`);
  console.log(`Activos quietos >${inactiveMonths} meses: ${membersReport.quiet.length}`);
  console.log("Política recomendada: flag + export; no hard-delete de chats.");
  console.log("\nPara ver candidatos a borrar (sin borrar): npm run cleanup:orphans");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

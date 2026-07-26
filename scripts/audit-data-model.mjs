import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key || !anonKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY y/o SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonymous = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PAGE_SIZE = 1000;

async function fetchAll(table, columns) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

function duplicateCount(rows, keyOf) {
  const seen = new Set();
  let duplicates = 0;
  for (const row of rows) {
    const keyValue = keyOf(row);
    if (keyValue == null || keyValue === "") continue;
    if (seen.has(keyValue)) duplicates += 1;
    else seen.add(keyValue);
  }
  return duplicates;
}

async function main() {
  const [{ error: publicCatalogError }, { error: privatePromptReadError }] =
    await Promise.all([
      anonymous.from("gpts_public").select("id").limit(1),
      anonymous.from("gpts").select("id,system_prompt").limit(1),
    ]);

  const [
    members,
    profiles,
    gpts,
    threads,
    messages,
    files,
    usage,
    authEvents,
    webhookEvents,
  ] = await Promise.all([
    fetchAll("allowed_members", "id,email,is_active,monthly_message_limit"),
    fetchAll("profiles", "id,email,is_admin"),
    fetchAll("gpts", "id,is_active,system_prompt"),
    fetchAll(
      "threads",
      "id,user_id,gpt_id,openai_conversation_id,status,status_changed_at"
    ),
    fetchAll("messages", "id,thread_id,user_id,role,files,created_at"),
    fetchAll("uploaded_files", "openai_file_id,user_id,storage_path,mime"),
    fetchAll("usage_events", "id,user_id,gpt_id,thread_id,tokens_in,tokens_out,cost"),
    fetchAll("auth_events", "id"),
    fetchAll("webhook_events", "id"),
  ]);

  const threadOwners = new Map(threads.map((thread) => [thread.id, thread.user_id]));
  const threadGpts = new Map(threads.map((thread) => [thread.id, thread.gpt_id]));
  const fileOwners = new Map(files.map((file) => [file.openai_file_id, file.user_id]));

  let messageOwnerMismatch = 0;
  let messageWithoutThread = 0;
  let attachmentWithoutMap = 0;
  let attachmentOwnerMismatch = 0;

  for (const message of messages) {
    const owner = threadOwners.get(message.thread_id);
    if (owner == null) messageWithoutThread += 1;
    else if (owner !== message.user_id) messageOwnerMismatch += 1;

    if (!Array.isArray(message.files)) continue;
    for (const file of message.files) {
      const fileOwner = fileOwners.get(file?.openai_file_id);
      if (fileOwner == null) attachmentWithoutMap += 1;
      else if (fileOwner !== message.user_id) attachmentOwnerMismatch += 1;
    }
  }

  let usageThreadMismatch = 0;
  for (const event of usage) {
    if (!event.thread_id || !threadOwners.has(event.thread_id)) continue;
    if (
      threadOwners.get(event.thread_id) !== event.user_id ||
      threadGpts.get(event.thread_id) !== event.gpt_id
    ) {
      usageThreadMismatch += 1;
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    counts: {
      allowed_members: members.length,
      active_members: members.filter((row) => row.is_active).length,
      profiles: profiles.length,
      admins: profiles.filter((row) => row.is_admin).length,
      gpts: gpts.length,
      active_gpts: gpts.filter((row) => row.is_active).length,
      threads: threads.length,
      messages: messages.length,
      uploaded_files: files.length,
      usage_events: usage.length,
      auth_events: authEvents.length,
      webhook_events: webhookEvents.length,
    },
    integrity: {
      threads_without_user: threads.filter((row) => !row.user_id).length,
      threads_without_gpt: threads.filter((row) => !row.gpt_id).length,
      duplicate_openai_conversations: duplicateCount(
        threads,
        (row) => row.openai_conversation_id
      ),
      messages_without_thread: messageWithoutThread,
      message_owner_mismatches: messageOwnerMismatch,
      uploaded_files_without_user: files.filter((row) => !row.user_id).length,
      duplicate_storage_paths_per_user: duplicateCount(
        files,
        (row) => (row.user_id && row.storage_path ? `${row.user_id}:${row.storage_path}` : null)
      ),
      attachments_without_file_map: attachmentWithoutMap,
      attachment_owner_mismatches: attachmentOwnerMismatch,
      usage_thread_mismatches: usageThreadMismatch,
      negative_member_limits: members.filter(
        (row) => row.monthly_message_limit != null && row.monthly_message_limit < 0
      ).length,
      invalid_usage_values: usage.filter(
        (row) =>
          (row.tokens_in != null && row.tokens_in < 0) ||
          (row.tokens_out != null && row.tokens_out < 0) ||
          (row.cost != null && Number(row.cost) < 0)
      ).length,
      active_gpts_without_prompt: gpts.filter(
        (row) => row.is_active && !row.system_prompt?.trim()
      ).length,
    },
    access: {
      anonymous_catalog_readable: !publicCatalogError,
      anonymous_prompt_columns_blocked: Boolean(privatePromptReadError),
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import type { SupabaseClient } from "@supabase/supabase-js";
import type { IncomingFile } from "@/lib/chat-content";

const SCHEMA_RETRY_MS = 60_000;
let unavailableUntil = 0;

/**
 * Compatibility dual-write for the normalized attachment relationship.
 * `messages.files` remains the read model during phase 1, so a failure here is
 * observable but must not discard a user turn that was already persisted.
 */
export async function recordMessageAttachments(
  service: SupabaseClient,
  messageId: string,
  files: IncomingFile[]
): Promise<void> {
  if (files.length === 0) return;
  if (Date.now() < unavailableUntil) return;

  const { error } = await service.from("message_attachments").insert(
    files.map((file, position) => ({
      message_id: messageId,
      openai_file_id: file.openai_file_id,
      position,
      kind: file.type,
    }))
  );

  if (error?.code === "PGRST205" || error?.code === "42P01") {
    unavailableUntil = Date.now() + SCHEMA_RETRY_MS;
    return;
  }

  if (error) {
    console.error("message attachment relation error", {
      messageId,
      code: error.code,
      message: error.message,
    });
    return;
  }

  unavailableUntil = 0;
}

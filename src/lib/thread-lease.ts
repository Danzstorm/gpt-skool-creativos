import type { SupabaseClient } from "@supabase/supabase-js";

export interface ThreadLease {
  token: string | null;
  legacy: boolean;
}

function rpcIsMissing(code: string | undefined): boolean {
  return code === "PGRST202" || code === "42883";
}

/**
 * Acquires a tokenized seven-minute lease. Older databases transparently fall
 * back to the status-only RPC until their migration is applied.
 */
export async function acquireThreadLease(
  client: SupabaseClient,
  threadId: string
): Promise<ThreadLease | null> {
  const { data: token, error } = await client.rpc("acquire_thread_lease", {
    p_thread_id: threadId,
  });

  if (!error) {
    return typeof token === "string" ? { token, legacy: false } : null;
  }
  if (!rpcIsMissing(error.code)) throw error;

  const { data: locked, error: legacyError } = await client.rpc("acquire_thread_lock", {
    p_thread_id: threadId,
  });
  if (legacyError) throw legacyError;
  return locked ? { token: null, legacy: true } : null;
}

export async function releaseThreadLease(
  client: SupabaseClient,
  threadId: string,
  lease: ThreadLease
): Promise<void> {
  try {
    const { error } =
      lease.legacy || !lease.token
        ? await client.rpc("release_thread_lock", { p_thread_id: threadId })
        : await client.rpc("release_thread_lease", {
            p_thread_id: threadId,
            p_lock_token: lease.token,
          });

    // Releasing a lock is cleanup. A transient failure must not replace the
    // response the user already received; the database lease expires on its own.
    if (error) {
      console.error("thread lease release error", {
        threadId,
        code: error.code,
        message: error.message,
      });
    }
  } catch (error) {
    console.error("thread lease release exception", {
      threadId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

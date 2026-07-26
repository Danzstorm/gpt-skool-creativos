import type { SupabaseClient } from "@supabase/supabase-js";

export interface GptRuntimeConfig {
  system_prompt: string | null;
  model: string | null;
  tools_enabled?: { file_search?: boolean; code_interpreter?: boolean } | null;
}

const SCHEMA_RETRY_MS = 60_000;
let unavailableUntil = 0;

/**
 * Reads the server-only runtime configuration introduced in the phase-1 data
 * model migration. The legacy columns remain a fallback so previews or older
 * environments can deploy the application before receiving the migration.
 */
export async function getGptRuntimeConfig(
  service: SupabaseClient,
  gptId: string,
  fallback: GptRuntimeConfig
): Promise<GptRuntimeConfig> {
  if (Date.now() < unavailableUntil) return fallback;

  const { data, error } = await service
    .from("gpt_private_config")
    .select("system_prompt, model, tools_enabled")
    .eq("gpt_id", gptId)
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") {
      unavailableUntil = Date.now() + SCHEMA_RETRY_MS;
      return fallback;
    }
    throw error;
  }

  unavailableUntil = 0;
  return data ?? fallback;
}

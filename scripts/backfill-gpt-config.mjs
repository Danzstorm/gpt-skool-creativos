// One-time backfill: copia instructions/model de cada Assistant de OpenAI
// hacia las columnas system_prompt/model de la tabla `gpts` en Supabase.
// Necesario antes de la migración a Responses API (Assistants se apaga 2026-08-26).
//
// Uso: node --env-file=.env.local scripts/backfill-gpt-config.mjs

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function main() {
  const { data: gpts, error } = await supabase
    .from("gpts")
    .select("id, name, openai_assistant_id")
    .not("openai_assistant_id", "is", null);

  if (error) throw error;

  console.log(`Encontrados ${gpts.length} GPTs con openai_assistant_id.`);

  let ok = 0;
  let failed = 0;

  for (const gpt of gpts) {
    try {
      const assistant = await openai.beta.assistants.retrieve(gpt.openai_assistant_id);
      const { error: updateError } = await supabase
        .from("gpts")
        .update({
          system_prompt: assistant.instructions ?? "",
          model: assistant.model,
        })
        .eq("id", gpt.id);

      if (updateError) throw updateError;
      console.log(`OK  ${gpt.name} (${gpt.id}) -> model=${assistant.model}`);
      ok++;
    } catch (err) {
      console.error(`FALLO ${gpt.name} (${gpt.id}):`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`\nCompletado: ${ok} ok, ${failed} fallidos de ${gpts.length}.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

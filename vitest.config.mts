import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Todo lo que se testea aquí es lógica de servidor sin DOM: los módulos de
    // `src/lib` reciben su cliente de Supabase/OpenAI por argumento, así que no
    // hace falta ni jsdom ni mocks de framework.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

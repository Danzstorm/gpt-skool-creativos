import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import {
  buildProjectContextItem,
  MAX_PROJECT_INSTRUCTIONS_CHARS,
  PENDING_FINGERPRINT,
  projectContextFingerprint,
  projectInstructionsOf,
  syncProjectContext,
} from "./project-instructions";

/** El texto plano del item, para no repetir el destructuring en cada caso. */
function textOf(item: ReturnType<typeof buildProjectContextItem>): string {
  const content = (item as { content: { type: string; text: string }[] }).content;
  return content.map((part) => part.text).join("");
}

describe("buildProjectContextItem", () => {
  it("manda el contexto como turno de usuario, nunca como sistema", () => {
    const item = buildProjectContextItem("La marca es Creativos.");

    // El rol es LO que arregla el problema: el texto del miembro entra por el
    // mismo canal que su propio mensaje, no por el del prompt del admin.
    expect(item).not.toBeNull();
    expect((item as { role: string }).role).toBe("user");
    expect(textOf(item)).toContain("La marca es Creativos.");
  });

  it("no arma ningún turno cuando la carpeta no tiene texto", () => {
    expect(buildProjectContextItem(null)).toBeNull();
    expect(buildProjectContextItem("")).toBeNull();
    // Solo espacios es "sin instrucciones": si no, un textarea con un enter
    // suelto mandaría un turno vacío a la conversación.
    expect(buildProjectContextItem("   \n  ")).toBeNull();
  });

  it("corta el texto en el tope aunque llegue más largo de la base", () => {
    const item = buildProjectContextItem("a".repeat(MAX_PROJECT_INSTRUCTIONS_CHARS + 500));
    const text = textOf(item);

    expect(text).toContain("a".repeat(MAX_PROJECT_INSTRUCTIONS_CHARS));
    expect(text).not.toContain("a".repeat(MAX_PROJECT_INSTRUCTIONS_CHARS + 1));
  });
});

describe("projectContextFingerprint", () => {
  it("es estable para el mismo texto y distinta para otro", () => {
    expect(projectContextFingerprint("Tono cercano.")).toBe(
      projectContextFingerprint("Tono cercano.")
    );
    expect(projectContextFingerprint("Tono cercano.")).not.toBe(
      projectContextFingerprint("Tono formal.")
    );
  });

  it("ignora los espacios de los bordes, igual que el texto que se manda", () => {
    // Si no coincidieran, guardar el mismo texto con un enter al final
    // reemplazaría el contexto entero por una diferencia que el modelo ni ve.
    expect(projectContextFingerprint("  Tono cercano.  ")).toBe(
      projectContextFingerprint("Tono cercano.")
    );
  });

  it("es null sin texto, para distinguir «no tiene ninguno» de un hash", () => {
    expect(projectContextFingerprint(null)).toBeNull();
    expect(projectContextFingerprint("  ")).toBeNull();
  });
});

const VIEJO = "Tono cercano.";
const NUEVO = "Tono formal.";

/** Un item de contexto tal como queda guardado en la Conversation. */
function contextItem(id: string, texto: string) {
  return {
    id,
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: textOf(buildProjectContextItem(texto)) }],
  };
}

/** Un mensaje cualquiera del usuario, que el barrido NO debe tocar. */
function userItem(id: string, texto: string) {
  return { id, type: "message", role: "user", content: [{ type: "input_text", text: texto }] };
}

function fakeOpenAI(
  options: { items?: unknown[]; createFails?: boolean; deleteStatus?: number } = {}
) {
  const deleted: string[] = [];
  const created: unknown[][] = [];

  const openai = {
    conversations: {
      items: {
        async list() {
          return { data: options.items ?? [] };
        },
        async delete(itemId: string) {
          if (options.deleteStatus) {
            throw Object.assign(new Error("nope"), { status: options.deleteStatus });
          }
          deleted.push(itemId);
          return {};
        },
        async create(_conversationId: string, body: { items: unknown[] }) {
          if (options.createFails) throw new Error("500 de OpenAI");
          created.push(body.items);
          return { data: [{ id: "item_nuevo" }] };
        },
      },
    },
  } as unknown as OpenAI;

  return { openai, deleted, created };
}

/** `failUpdateAt` es 1-based: 1 = falla la primera escritura, 2 = la segunda. */
function fakeSupabase(options: { failUpdateAt?: number } = {}) {
  const updates: Record<string, unknown>[] = [];
  const builder = {
    from: () => builder,
    update(payload: Record<string, unknown>) {
      updates.push(payload);
      return builder;
    },
    eq: () => builder,
    then(resolve: (value: unknown) => void) {
      const failing = options.failUpdateAt === updates.length;
      resolve(failing ? { error: { message: "Postgres caído" } } : { error: null });
    },
  };
  return { client: builder as unknown as SupabaseClient, updates };
}

const base = {
  threadId: "thread-1",
  conversationId: "conv-1",
  conversationRecreated: false,
};

describe("syncProjectContext", () => {
  it("borra el turno viejo cuando el chat sale de la carpeta", async () => {
    // Antes solo se dejaba de mandar el texto, así que la carpeta seguía
    // mandando sobre un chat que ya no le pertenecía.
    const { openai, deleted, created } = fakeOpenAI({
      items: [userItem("msg_1", "hola"), contextItem("ctx_1", VIEJO)],
    });
    const { client, updates } = fakeSupabase();

    await syncProjectContext({
      ...base,
      openai,
      supabase: client,
      instructions: null,
      appliedFingerprint: projectContextFingerprint(VIEJO),
    });

    expect(deleted).toEqual(["ctx_1"]);
    expect(created).toHaveLength(0);
    expect(updates.at(-1)).toEqual({ project_context_fingerprint: null });
  });

  it("reemplaza el turno viejo cuando el texto cambia, no lo apila", async () => {
    const { openai, deleted, created } = fakeOpenAI({
      items: [contextItem("ctx_1", VIEJO), userItem("msg_1", "hola")],
    });
    const { client, updates } = fakeSupabase();

    await syncProjectContext({
      ...base,
      openai,
      supabase: client,
      instructions: NUEVO,
      appliedFingerprint: projectContextFingerprint(VIEJO),
    });

    expect(deleted).toEqual(["ctx_1"]);
    expect(created).toHaveLength(1);
    expect(updates.at(-1)).toEqual({
      project_context_fingerprint: projectContextFingerprint(NUEVO),
    });
  });

  it("barre TODAS las copias sueltas, no solo una", async () => {
    // El agujero que cierra el barrido: si una corrida anterior creó el turno y
    // no llegó a registrarlo, con borrado por id esas copias eran invisibles y
    // cada turno agregaba otra. Acá se van todas juntas.
    const { openai, deleted, created } = fakeOpenAI({
      items: [
        contextItem("ctx_1", VIEJO),
        userItem("msg_1", "hola"),
        contextItem("ctx_2", VIEJO),
        contextItem("ctx_3", VIEJO),
      ],
    });
    const { client } = fakeSupabase();

    await syncProjectContext({
      ...base,
      openai,
      supabase: client,
      instructions: NUEVO,
      // La fila dice que no hay nada aplicado — el caso exacto que dejaba la
      // escritura fallida de la corrida anterior.
      appliedFingerprint: null,
    });

    expect(deleted).toEqual(["ctx_1", "ctx_2", "ctx_3"]);
    expect(created).toHaveLength(1);
  });

  it("no toca los mensajes del usuario al barrer", async () => {
    const { openai, deleted } = fakeOpenAI({
      items: [userItem("msg_1", "hola"), userItem("msg_2", "seguimos")],
    });
    const { client } = fakeSupabase();

    await syncProjectContext({
      ...base,
      openai,
      supabase: client,
      instructions: NUEVO,
      appliedFingerprint: null,
    });

    expect(deleted).toHaveLength(0);
  });

  it("no toca nada cuando la Conversation ya tiene ese mismo texto", async () => {
    const { openai, deleted, created } = fakeOpenAI({ items: [contextItem("ctx_1", VIEJO)] });
    const { client, updates } = fakeSupabase();

    await syncProjectContext({
      ...base,
      openai,
      supabase: client,
      instructions: VIEJO,
      appliedFingerprint: projectContextFingerprint(VIEJO),
    });

    expect(deleted).toHaveLength(0);
    expect(created).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("tras recrear la Conversation vuelve a poner el texto", async () => {
    // La nueva se sembró desde `messages`, donde el turno de contexto nunca se
    // guarda: la fila dice "aplicado" pero describía a la Conversation anterior.
    const { openai, created } = fakeOpenAI({ items: [] });
    const { client, updates } = fakeSupabase();

    await syncProjectContext({
      ...base,
      openai,
      supabase: client,
      conversationRecreated: true,
      instructions: VIEJO,
      appliedFingerprint: projectContextFingerprint(VIEJO),
    });

    expect(created).toHaveLength(1);
    expect(updates.at(-1)).toEqual({
      project_context_fingerprint: projectContextFingerprint(VIEJO),
    });
  });

  it("trata el 404 al borrar como éxito: ya no estaba, que es lo que se buscaba", async () => {
    const { openai, created } = fakeOpenAI({
      items: [contextItem("ctx_fantasma", VIEJO)],
      deleteStatus: 404,
    });
    const { client, updates } = fakeSupabase();

    await syncProjectContext({
      ...base,
      openai,
      supabase: client,
      instructions: NUEVO,
      appliedFingerprint: projectContextFingerprint(VIEJO),
    });

    expect(created).toHaveLength(1);
    expect(updates.at(-1)?.project_context_fingerprint).toBe(projectContextFingerprint(NUEVO));
  });

  it("no tira si OpenAI falla, y deja la fila en pendiente: el mensaje vale más", async () => {
    const { openai } = fakeOpenAI({ createFails: true });
    const { client, updates } = fakeSupabase();

    await expect(
      syncProjectContext({
        ...base,
        openai,
        supabase: client,
        instructions: NUEVO,
        appliedFingerprint: null,
      })
    ).resolves.toBeUndefined();

    // Nunca se confirma una huella que mienta: queda pendiente y el próximo
    // turno reconcilia.
    expect(updates).toEqual([{ project_context_fingerprint: PENDING_FINGERPRINT }]);
  });

  it("marca pendiente ANTES de tocar la Conversation", async () => {
    const { openai } = fakeOpenAI({ items: [contextItem("ctx_1", VIEJO)] });
    const { client, updates } = fakeSupabase();

    await syncProjectContext({
      ...base,
      openai,
      supabase: client,
      instructions: NUEVO,
      appliedFingerprint: projectContextFingerprint(VIEJO),
    });

    expect(updates[0]).toEqual({ project_context_fingerprint: PENDING_FINGERPRINT });
    expect(updates.at(-1)).toEqual({
      project_context_fingerprint: projectContextFingerprint(NUEVO),
    });
  });

  it("no toca la Conversation si ni siquiera se pudo marcar el pendiente", async () => {
    // La fila queda con la huella vieja, que sigue siendo verdad porque no se
    // tocó nada. El próximo turno reintenta desde cero.
    const { openai, deleted, created } = fakeOpenAI({ items: [contextItem("ctx_1", VIEJO)] });
    const { client } = fakeSupabase({ failUpdateAt: 1 });

    await syncProjectContext({
      ...base,
      openai,
      supabase: client,
      instructions: NUEVO,
      appliedFingerprint: projectContextFingerprint(VIEJO),
    });

    expect(deleted).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  it("reconcilia una fila pendiente aunque el texto coincida con lo guardado", async () => {
    // EL agujero que cierra el pendiente. Antes: editabas A→B, fallaba el
    // guardado (la Conversation ya tenía B, la fila decía A), deshacías la
    // edición volviendo a A y la comparación daba igual — salida temprana, y ese
    // chat se quedaba con B para siempre. Con la fila en pendiente, el texto que
    // coincide no alcanza para saltear: se barre y se rehace.
    const { openai, deleted, created } = fakeOpenAI({ items: [contextItem("ctx_b", NUEVO)] });
    const { client, updates } = fakeSupabase();

    await syncProjectContext({
      ...base,
      openai,
      supabase: client,
      instructions: VIEJO,
      appliedFingerprint: PENDING_FINGERPRINT,
    });

    expect(deleted).toEqual(["ctx_b"]);
    expect(created).toHaveLength(1);
    expect(updates.at(-1)).toEqual({
      project_context_fingerprint: projectContextFingerprint(VIEJO),
    });
  });
});

describe("projectInstructionsOf", () => {
  it("lee la relación embebida venga como objeto o como array", () => {
    expect(projectInstructionsOf({ projects: { instructions: "Tono cercano." } })).toBe(
      "Tono cercano."
    );
    expect(projectInstructionsOf({ projects: [{ instructions: "Tono cercano." }] })).toBe(
      "Tono cercano."
    );
  });

  it("devuelve null cuando la conversación no está en ninguna carpeta", () => {
    expect(projectInstructionsOf({ projects: null })).toBeNull();
    expect(projectInstructionsOf({ projects: [] })).toBeNull();
    expect(projectInstructionsOf({})).toBeNull();
    expect(projectInstructionsOf(null)).toBeNull();
  });

  it("devuelve null cuando la carpeta existe pero no tiene instrucciones", () => {
    expect(projectInstructionsOf({ projects: { instructions: null } })).toBeNull();
  });
});

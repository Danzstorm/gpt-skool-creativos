/**
 * Errores de red/HTTP del stream de chat, sin React.
 * El hook solo orquesta fetch + estado; estas reglas se testean con Vitest.
 */

export function friendlyStreamError(err: unknown): string {
  if (err instanceof Error) {
    const raw = err.message.toLowerCase();
    const isRawNetworkError =
      raw.includes("fetch") || raw.includes("network") || raw.includes("load failed");
    if (isRawNetworkError) return "Se perdió la conexión. Intenta de nuevo.";
    return err.message;
  }
  return "No se pudo completar la respuesta. Intenta de nuevo.";
}

export type ChatStreamHttpResult =
  | { kind: "ok" }
  | { kind: "revoked" }
  | { kind: "error"; message: string };

/**
 * Traduce 429/409/403/otros fallos HTTP de /api/chat a un resultado de UI.
 * `revoked` obliga a navegación completa: la sesión ya la cerró el proxy.
 */
export async function interpretChatStreamResponse(
  res: Response
): Promise<ChatStreamHttpResult> {
  if (res.status === 429) {
    return {
      kind: "error",
      message: "Demasiados mensajes seguidos. Espera unos segundos e intenta de nuevo.",
    };
  }
  if (res.status === 409) {
    return {
      kind: "error",
      message: "Ya hay una respuesta en curso para esta conversación. Espera a que termine.",
    };
  }
  if (res.status === 403) {
    const data = await res.json().catch(() => null);
    if (data?.code === "membership_revoked") return { kind: "revoked" };
    return {
      kind: "error",
      message: data?.error || "Alcanzaste tu límite de mensajes de este mes.",
    };
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { kind: "error", message: data?.error || "Error al enviar mensaje" };
  }
  return { kind: "ok" };
}

/** Rótulo optimista del sidebar cuando el turno no tiene texto. */
export function clientAttachmentLabel(files: Array<{ type: string }>): string {
  if (files.length === 1) {
    return files[0].type === "image" ? "Imagen adjunta" : "Archivo adjunto";
  }
  const imageCount = files.filter((file) => file.type === "image").length;
  return imageCount === files.length
    ? `${files.length} imágenes adjuntas`
    : `${files.length} archivos adjuntos`;
}

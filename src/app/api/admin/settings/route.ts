import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const service = createServiceClient();
  const { data, error } = await service.from("app_settings").select("*").eq("id", 1).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

const MAX_NAME = 80;
const MAX_EMAIL = 160;
const MAX_URL = 500;

/**
 * Solo http(s), y solo URLs absolutas.
 *
 * `skool_url` y `logo_url` acaban en el `href`/`src` de páginas PÚBLICAS
 * (`login`, `unauthorized`) porque `app_settings` es legible por `anon`. Sin
 * este filtro, una cuenta de admin comprometida planta un `javascript:` en la
 * pantalla de login que ve toda la comunidad. Vacío es válido: significa "sin
 * configurar" y el código ya tiene fallbacks.
 */
function invalidUrl(value: unknown, field: string): string | null {
  if (typeof value !== "string") return `${field} debe ser texto`;
  if (value.trim() === "") return null;
  if (value.length > MAX_URL) return `${field} supera ${MAX_URL} caracteres`;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return `${field} debe ser una URL absoluta`;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `${field} solo admite http o https`;
  }
  return null;
}

export async function PATCH(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- body de forma libre, validado campo a campo abajo
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Se esperaba un objeto" }, { status: 400 });
  }

  const { community_name, logo_url, skool_url, support_email, default_monthly_message_limit } = body;

  if (community_name !== undefined) {
    if (typeof community_name !== "string" || community_name.trim() === "") {
      return NextResponse.json({ error: "community_name no puede quedar vacío" }, { status: 400 });
    }
    if (community_name.length > MAX_NAME) {
      return NextResponse.json({ error: `community_name supera ${MAX_NAME} caracteres` }, { status: 400 });
    }
  }

  for (const [field, value] of [
    ["logo_url", logo_url],
    ["skool_url", skool_url],
  ] as const) {
    if (value === undefined) continue;
    const problem = invalidUrl(value, field);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  if (support_email !== undefined) {
    if (typeof support_email !== "string" || support_email.length > MAX_EMAIL) {
      return NextResponse.json({ error: "support_email inválido" }, { status: 400 });
    }
    // Se muestra como texto y como mailto:, así que basta con descartar lo que
    // no tenga forma de correo. No se valida entrega, eso no es asunto de aquí.
    if (support_email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(support_email.trim())) {
      return NextResponse.json({ error: "support_email no parece un correo" }, { status: 400 });
    }
  }

  // null es intencional y significa "sin límite" (lo consume src/lib/quota.ts).
  if (default_monthly_message_limit !== undefined && default_monthly_message_limit !== null) {
    if (
      typeof default_monthly_message_limit !== "number" ||
      !Number.isInteger(default_monthly_message_limit) ||
      default_monthly_message_limit < 0
    ) {
      return NextResponse.json(
        { error: "default_monthly_message_limit debe ser un entero >= 0 o null" },
        { status: 400 }
      );
    }
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("app_settings")
    .update({
      ...(community_name !== undefined && { community_name: community_name.trim() }),
      ...(logo_url !== undefined && { logo_url: logo_url.trim() }),
      ...(skool_url !== undefined && { skool_url: skool_url.trim() }),
      ...(support_email !== undefined && { support_email: support_email.trim() }),
      ...(default_monthly_message_limit !== undefined && { default_monthly_message_limit }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

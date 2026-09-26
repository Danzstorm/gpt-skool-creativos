import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeEmail } from "@/lib/membership";
import { logAuthEvent } from "@/lib/auth-events";
import { finishLogin } from "@/lib/finish-login";

// Valida el código que llegó por correo y abre la sesión (las cookies las escribe
// el cliente de servidor). Después aplica el mismo gate de membresía que el login
// con Google y devuelve a dónde ir.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const code = typeof body?.code === "string" ? body.code.replace(/\D/g, "") : "";
  if (!email || code.length < 6 || code.length > 10) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) {
    await logAuthEvent({
      event: "callback_error",
      email,
      provider: "email",
      reason: `verify_code: ${error?.message ?? "sin usuario"}`,
      request,
    });
    if (error?.status === 429) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const redirect = await finishLogin({ supabase, user: data.user, provider: "email", request });
  return NextResponse.json({ redirect });
}

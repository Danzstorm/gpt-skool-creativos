// Da de alta al primer admin de una instancia. Es EL paso de bootstrap al
// montar la plataforma para un cliente nuevo.
//
// Reemplaza al `UPDATE profiles SET is_admin = true` que se documentaba antes,
// que tiene un fallo silencioso: no crea la fila en `allowed_members`, así que
// el gate de membresía (proxy.ts) expulsa a ese admin a /unauthorized en su
// primer request. Quedaba "admin" en la base y sin poder entrar.
//
// Idempotente: correrlo dos veces no rompe nada.
//
// Uso: node --env-file=.env.local scripts/bootstrap-admin.mjs admin@cliente.com

import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.toLowerCase().trim();

if (!email || !email.includes("@")) {
  console.error("Uso: node --env-file=.env.local scripts/bootstrap-admin.mjs <email>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. ¿Pasaste --env-file=.env.local?");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  // ¿Ya entró alguna vez? `profiles` solo existe tras el primer login.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, is_admin")
    .eq("email", email)
    .maybeSingle();
  if (profileError) throw profileError;

  // Acceso primero: sin esto el gate lo echa aunque sea admin.
  // source 'manual' lo protege de la revocación por import de CSV
  // (ver members-sync.ts: solo revoca lo que no es 'manual').
  const { error: accessError } = await supabase.from("allowed_members").upsert(
    {
      email,
      is_active: true,
      source: "manual",
      ...(profile ? {} : { pending_admin: true }),
    },
    { onConflict: "email", ignoreDuplicates: false }
  );
  if (accessError) throw accessError;

  if (!profile) {
    console.log(`✓ ${email} tiene acceso habilitado.`);
    console.log("  Todavía no ha iniciado sesión, así que aún no existe su perfil.");
    console.log("  Queda admin automáticamente la primera vez que entre (pending_admin).");
    return;
  }

  const { error: promoteError } = await supabase
    .from("profiles")
    .update({ is_admin: true })
    .eq("id", profile.id);
  if (promoteError) throw promoteError;

  console.log(`✓ ${email} tiene acceso habilitado y ya es admin.`);
}

main().catch((err) => {
  console.error("FALLO:", err.message ?? err);
  process.exit(1);
});

// Borra cuentas de auth.users que nunca debieron existir: quien autenticó con
// Google (o magic link) sin estar en la whitelist. El proveedor lo autentica
// ANTES de que podamos comprobar la membresía, así que el rechazo llega cuando
// GoTrue ya creó el usuario y el trigger ya creó su perfil.
//
// Se limpian porque `profiles` es la señal de "esta persona ya entró" que usa
// /admin/members: sin esto, alguien que fue rechazado aparece como si hubiera
// entrado, y el admin no puede confiar en esa columna.
//
// Script APARTE de cleanup-orphans.mjs a propósito: aquel borra archivos, este
// borra cuentas. No conviene que quien corre una limpieza de storage pueda
// llevarse usuarios por delante.
//
// Es destructivo: por defecto solo informa. Hay que pasar --confirm para borrar.
//
// Uso: node --env-file=.env.local scripts/cleanup-orphan-users.mjs [--confirm]

import { createClient } from "@supabase/supabase-js";
import { fetchAllRows } from "./lib/fetch-all.mjs";

// Margen para no borrar a alguien que está en pleno proceso de alta: se une a
// Skool, entra antes de que Zapier lo sincronice, es rechazado, y minutos
// después ya es miembro legítimo. Borrarle la cuenta en esa ventana no rompe
// nada (puede volver a entrar), pero sí perdería su historial.
const MIN_AGE_DAYS = 7;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const confirm = process.argv.includes("--confirm");

async function main() {
  // Paginado: PostgREST corta en max_rows (1000) sin avisar, y estos dos
  // conjuntos son las redes que impiden borrar la cuenta de alguien real. Un
  // set truncado hace que un miembro activo parezca inactivo, o que alguien con
  // conversaciones parezca no tenerlas — y acá lo que se borra son cuentas.
  const members = await fetchAllRows((from, to) =>
    supabase
      .from("allowed_members")
      .select("email, is_active")
      .order("email", { ascending: true })
      .range(from, to)
  );

  const active = new Set(
    members.filter((m) => m.is_active).map((m) => m.email.toLowerCase().trim())
  );

  // Los threads son el criterio de "acá hay algo que perder". Si alguien alcanzó
  // a conversar, su cuenta no se toca aunque hoy no sea miembro — eso es una
  // baja, no un huérfano, y sus conversaciones deben seguir ahí si vuelve.
  const threads = await fetchAllRows((from, to) =>
    supabase.from("threads").select("user_id").order("id", { ascending: true }).range(from, to)
  );
  const withThreads = new Set(threads.map((t) => t.user_id));

  const cutoff = Date.now() - MIN_AGE_DAYS * 86400_000;
  const orphans = [];

  // listUsers pagina; sin recorrerlo entero solo se limpiarían los primeros.
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    if (!data.users.length) break;

    for (const u of data.users) {
      const email = (u.email ?? "").toLowerCase().trim();
      if (!email) continue;
      if (active.has(email)) continue;
      if (withThreads.has(u.id)) continue;
      if (new Date(u.created_at).getTime() > cutoff) continue;
      orphans.push(u);
    }

    if (data.users.length < 200) break;
    page++;
  }

  console.log(`${orphans.length} cuentas huérfanas (sin membresía activa, sin conversaciones, >${MIN_AGE_DAYS} días).`);

  if (!orphans.length) return;

  for (const u of orphans) {
    console.log(`  ${u.email}  creada ${new Date(u.created_at).toISOString().slice(0, 10)}`);
  }

  if (!confirm) {
    console.log("\nNada borrado. Repite con --confirm para aplicar.");
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const u of orphans) {
    const { error } = await supabase.auth.admin.deleteUser(u.id);
    if (error) {
      failed++;
      console.error(`FALLO ${u.email}: ${error.message}`);
    } else {
      ok++;
    }
  }

  console.log(`\nCompletado: ${ok} borradas, ${failed} fallidas.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("FALLO:", err.message ?? err);
  process.exit(1);
});

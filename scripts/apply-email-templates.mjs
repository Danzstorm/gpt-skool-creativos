// Sube las plantillas de correo de supabase/email-templates/ a Supabase Auth.
//
// Los correos de acceso los manda Supabase (GoTrue), no esta app, así que las
// plantillas no viven en el repo por defecto — se editan a mano en el dashboard
// y no quedan versionadas. Este script las mantiene en git y las publica.
//
// Uso:
//   SUPABASE_ACCESS_TOKEN=sbp_xxx SUPABASE_PROJECT_REF=xxx node scripts/apply-email-templates.mjs
//
// El token se genera en Supabase → Account → Access Tokens. Es de cuenta
// completa: úsalo y revócalo, no lo dejes en un .env.

import fs from "node:fs";
import path from "node:path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;

if (!token || !ref) {
  console.error("Faltan SUPABASE_ACCESS_TOKEN y/o SUPABASE_PROJECT_REF.");
  process.exit(1);
}

// "confirmation" la recibe quien entra por primera vez (signInWithOtp crea el
// usuario), "magic_link" quien ya entró antes. Casi todos los miembros nuevos
// verán la primera, por eso las dos tienen que estar en español.
const TEMPLATES = [
  {
    file: "bienvenida.html",
    contentKey: "mailer_templates_confirmation_content",
    subjectKey: "mailer_subjects_confirmation",
    subject: "Tu acceso a GPT Creativos",
  },
  {
    file: "acceso.html",
    contentKey: "mailer_templates_magic_link_content",
    subjectKey: "mailer_subjects_magic_link",
    subject: "Tu enlace de acceso a GPT Creativos",
  },
];

const dir = path.join(import.meta.dirname, "..", "supabase", "email-templates");
const payload = {};

for (const t of TEMPLATES) {
  const html = fs.readFileSync(path.join(dir, t.file), "utf8");
  if (!html.includes("{{ .ConfirmationURL }}")) {
    console.error(`${t.file} no contiene {{ .ConfirmationURL }} — sin eso el correo no sirve para entrar.`);
    process.exit(1);
  }
  payload[t.contentKey] = html;
  payload[t.subjectKey] = t.subject;
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

if (!res.ok) {
  console.error(`Error ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const conf = await res.json();
for (const t of TEMPLATES) {
  const ok = conf[t.contentKey] === payload[t.contentKey];
  console.log(`${ok ? "OK " : "?? "} ${t.file} -> ${t.contentKey} | asunto: "${conf[t.subjectKey]}"`);
}

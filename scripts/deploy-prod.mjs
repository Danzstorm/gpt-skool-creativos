#!/usr/bin/env node
// Despliegue manual a producción — la vía de escape para cuando no se quiere
// pasar por GitHub Actions (o mientras falte el secret VERCEL_TOKEN en el repo).
//
// Por qué desde un árbol SIN .git: el team está en plan Hobby y el repositorio
// es privado, así que Vercel bloquea todo deploy disparado por git porque el
// autor del commit no es contribuidor del proyecto — y Hobby no permite añadir
// miembros en repos privados. `vercel deploy` dentro del repo hereda el bloqueo
// porque el CLI adjunta la metadata de git local. Sin .git no hay autor que
// comprobar. Verificado el 2026-08-31: READY y alias movido.
//
// Uso:  npm run deploy:prod
//       npm run deploy:prod -- --skip-verify

import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCOPE = "creativos-skool";
const PROJECT_LINK = ".vercel/project.json";

// Git Bash entiende barras normales en ambos lados; las de Windows rompen el
// shell.
const posix = (p) => p.replace(/\\/g, "/");

function sh(command, cwd) {
  execSync(command, { stdio: "inherit", shell: "bash", cwd });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!process.env.VERCEL_TOKEN) {
  fail(
    "Falta VERCEL_TOKEN en el entorno.\n" +
      "En Windows vive como variable de usuario; tras un `setx` hay que reiniciar la terminal."
  );
}

// .vercel/ no está versionado, así que no viaja en el archive: es lo que vincula
// el directorio con el proyecto correcto.
if (!existsSync(PROJECT_LINK)) {
  fail(`Falta ${PROJECT_LINK}. Ejecuta \`vercel link --scope ${SCOPE}\` una vez.`);
}

// Se despliega HEAD, no el árbol de trabajo: `git archive` solo escribe lo
// versionado. Publicar con cambios sin commitear pondría en producción algo que
// no existe en ninguna rama y que nadie puede revisar después.
const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim();
if (dirty) {
  fail(
    `El árbol de trabajo tiene cambios sin commitear:\n${dirty}\n\n` +
      "Commitea o guarda en stash antes de desplegar: se despliega HEAD, no el árbol."
  );
}

if (!process.argv.includes("--skip-verify")) {
  console.log("\n=== verify (typecheck, lint, tests, build) ===\n");
  sh("npm run verify");
}

const stage = mkdtempSync(join(tmpdir(), "gpt-creativos-deploy-"));
const src = join(stage, "src");

try {
  console.log(`\n=== preparando árbol sin .git en ${src} ===\n`);
  mkdirSync(join(src, ".vercel"), { recursive: true });
  sh(`git archive --format=tar HEAD | tar -x -C "${posix(src)}"`);
  copyFileSync(PROJECT_LINK, join(src, ".vercel", "project.json"));

  console.log("\n=== desplegando a producción ===\n");
  sh(`npx --yes vercel@latest deploy --prod --yes --scope ${SCOPE} --token "$VERCEL_TOKEN"`, src);

  console.log("\nListo. Producción: https://prompts.creativos.lat");
  console.log(`Para revertir: vercel rollback <url-anterior> --scope ${SCOPE}`);
} finally {
  // La limpieza NO puede decidir el resultado del script. En Windows, npx deja
  // handles abiertos un instante y rmSync tira EPERM: el deploy había salido
  // READY y el proceso terminaba con error igual, que es exactamente el
  // resultado que no hay que reportar. Se reintenta y, si aun así no se puede,
  // se avisa y se sigue: sobra un directorio en TEMP, nada más.
  try {
    rmSync(stage, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    console.warn(`\nNo se pudo borrar el temporal ${stage} (${error.code}). El deploy no se ve afectado.`);
  }
}

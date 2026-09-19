import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Primer candidato que parece un nombre de persona, nunca un email.
 * Google a veces deja el correo en `full_name`; eso no se muestra en UI.
 */
export function humanDisplayName(...candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    const name = candidate?.trim();
    if (name && !name.includes("@")) return name;
  }
  return null;
}

/** Nombre de pila, o cadena vacía si no hay nombre real. */
export function firstNameOf(...candidates: (string | null | undefined)[]): string {
  const name = humanDisplayName(...candidates);
  if (!name) return "";
  return name.split(/\s+/)[0] ?? "";
}

/**
 * "juan.perez@gmail.com" → "j••••••••@gmail.com"
 *
 * Se usa al explicar un rechazo de acceso. Esos mensajes se pintan en páginas
 * sin sesión, así que mostrar el email entero convertiría la pantalla en un
 * oráculo para confirmar quién es miembro. Con la máscara, quien ya conoce su
 * propia dirección la reconoce y nadie más aprende nada.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local[0]}${"•".repeat(Math.max(local.length - 1, 3))}${domain}`;
}

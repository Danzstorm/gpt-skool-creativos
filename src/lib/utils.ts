import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * "juan.perez@gmail.com" → "j••••••••@gmail.com"
 *
 * Se usa al explicar un rechazo de acceso. Esos mensajes se pintan en páginas
 * sin sesión, así que mostrar el email entero convertiría la pantalla en un
 * oráculo para confirmar quién es miembro — justo lo que /api/auth/check-email
 * evita con su mensaje genérico. Con la máscara, quien ya conoce su propia
 * dirección la reconoce y nadie más aprende nada.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local[0]}${"•".repeat(Math.max(local.length - 1, 3))}${domain}`;
}

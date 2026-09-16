import { createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MembershipCheck =
  | { ok: true }
  | { ok: false; kind: "not_member" }
  | { ok: false; kind: "revoked" }
  // Autenticó con un email distinto al de su membresía (típico: entra con Google
  // usando su cuenta personal, pero en Skool está con otra). `memberEmail` es la
  // fila que casi con seguridad le corresponde — sirve para decirle cuál usar.
  | { ok: false; kind: "email_mismatch"; memberEmail: string }
  // No se pudo verificar (timeout, 500 de PostgREST, proyecto pausado). NO es un
  // "no": el proxy ya falla-abierto ante esto, y el callback tratándolo como
  // rechazo le decía a un miembro legítimo que su membresía había vencido.
  | { ok: false; kind: "check_failed"; error: string };

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// Forma canónica para DETECTAR que dos direcciones son de la misma persona.
// Solo se usa para explicar un rechazo, nunca para autorizar: quien no coincide
// exacto no entra, se le dice con qué cuenta entrar.
function canonical(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at < 1) return normalized;

  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  // El sufijo +tag es estándar en cualquier proveedor que lo soporte; los puntos
  // solo son irrelevantes en Gmail.
  const base = local.split("+")[0];
  if (!GMAIL_DOMAINS.has(domain)) return `${base}@${domain}`;
  return `${base.replace(/\./g, "")}@gmail.com`;
}

type MemberRow = { email: string; is_active: boolean | null };

export type MembershipServiceClient = SupabaseClient;

export type MembershipDeps = {
  service: MembershipServiceClient;
};

/**
 * Estado de acceso de un email. Fuente única de verdad del gate (magic link y OAuth).
 */
export async function checkMembershipWithDeps(
  email: string | null | undefined,
  deps: MembershipDeps
): Promise<MembershipCheck> {
  if (!email) return { ok: false, kind: "not_member" };

  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, kind: "not_member" };

  try {
    const { data, error } = await deps.service
      .from("allowed_members")
      .select("email, is_active")
      .eq("email", normalized)
      .maybeSingle<MemberRow>();

    if (error) return { ok: false, kind: "check_failed", error: error.message };
    if (data) return data.is_active ? { ok: true } : { ok: false, kind: "revoked" };

    // Sin fila exacta. Antes de declarar "no eres miembro" —el mensaje más
    // desmoralizante que puede recibir alguien que sí pagó— se busca si hay una
    // membresía que evidentemente es suya bajo otra dirección.
    const match = await findLikelyMember(deps.service, normalized);
    if (match) return { ok: false, kind: "email_mismatch", memberEmail: match };

    return { ok: false, kind: "not_member" };
  } catch (err) {
    return {
      ok: false,
      kind: "check_failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkMembership(
  email: string | null | undefined
): Promise<MembershipCheck> {
  if (!email || !normalizeEmail(email)) {
    return { ok: false, kind: "not_member" };
  }
  return checkMembershipWithDeps(email, { service: createServiceClient() });
}

/**
 * Verdadero si el email tiene acceso. Wrapper de `checkMembership` para los
 * llamadores a los que solo les importa el sí/no.
 *
 * Ojo: devuelve false también cuando la comprobación falló. Quien necesite
 * distinguir un "no" real de un "no se pudo saber" debe usar `checkMembership`.
 */
export async function isAllowedMember(
  email: string | null | undefined
): Promise<boolean> {
  return (await checkMembership(email)).ok;
}

/** TTL de caché en memoria (por instancia) para el gate del proxy. */
export const PROXY_MEMBERSHIP_TTL_MS = 60_000;

export type MembershipCacheEntry = { active: boolean; exp: number };

export type MembershipCache = Map<string, MembershipCacheEntry>;

const proxyMembershipCache: MembershipCache = new Map();

/**
 * Traduce un `MembershipCheck` a allow/deny para el proxy.
 * Fail-open solo ante `check_failed`; alias (`email_mismatch`) nunca autoriza.
 */
export function isActiveForProxy(check: MembershipCheck): boolean {
  if (check.ok) return true;
  if (check.kind === "check_failed") return true;
  return false;
}

export type CheckMembershipCachedOptions = {
  cache?: MembershipCache;
  ttlMs?: number;
  now?: () => number;
  onCheckFailed?: (error: string) => void;
};

/**
 * Gate del proxy: consulta membresía con caché TTL por email.
 * No cachea fallos transitorios (fail-open en cada request hasta que responda).
 */
export async function checkMembershipCached(
  email: string | null | undefined,
  deps: MembershipDeps,
  options: CheckMembershipCachedOptions = {}
): Promise<boolean> {
  if (!email) return false;
  const key = normalizeEmail(email);
  if (!key) return false;

  const cache = options.cache ?? proxyMembershipCache;
  const ttlMs = options.ttlMs ?? PROXY_MEMBERSHIP_TTL_MS;
  const now = options.now?.() ?? Date.now();

  const cached = cache.get(key);
  if (cached && cached.exp > now) return cached.active;

  const check = await checkMembershipWithDeps(email, deps);

  if (!check.ok && check.kind === "check_failed") {
    options.onCheckFailed?.(check.error);
    return true;
  }

  const active = isActiveForProxy(check);
  cache.set(key, { active, exp: now + ttlMs });
  return active;
}

/** Wrapper de producción para `src/proxy.ts`. */
export async function isActiveMemberForProxy(
  email: string | null | undefined
): Promise<boolean> {
  return checkMembershipCached(email, { service: createServiceClient() }, {
    onCheckFailed: (error) => {
      console.error("isActiveMemberForProxy: fallo de consulta, fail-open", error);
    },
  });
}

// Corre SOLO en el camino de rechazo (raro), así que puede permitirse traer un
// puñado de filas y comparar en JS: no hay índice posible sobre la forma
// canónica sin agregar una columna generada.
async function findLikelyMember(
  service: MembershipServiceClient,
  normalized: string
): Promise<string | null> {
  const at = normalized.lastIndexOf("@");
  if (at < 1) return null;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);

  // Caso barato y de cualquier dominio: entró con juan+skool@empresa.com y su
  // membresía es juan@empresa.com. Una consulta exacta más.
  if (local.includes("+")) {
    const stripped = `${local.split("+")[0]}@${domain}`;
    const { data } = await service
      .from("allowed_members")
      .select("email, is_active")
      .eq("email", stripped)
      .maybeSingle<MemberRow>();
    if (data?.is_active) return data.email;
  }

  // Caso de los puntos, exclusivo de Gmail: j.perez@gmail.com vs jperez@gmail.com.
  // No hay forma de expresarlo en SQL sin escanear, así que se traen las filas
  // de Gmail y se comparan canonicalizadas.
  if (!GMAIL_DOMAINS.has(domain)) return null;

  const target = canonical(normalized);
  const { data: rows } = await service
    .from("allowed_members")
    .select("email, is_active")
    .eq("is_active", true)
    .or("email.ilike.%@gmail.com,email.ilike.%@googlemail.com");

  const candidates = (rows ?? []) as MemberRow[];
  return candidates.find((r) => canonical(r.email) === target)?.email ?? null;
}

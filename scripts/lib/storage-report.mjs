// Agregados de gobernanza de Storage. Vive fuera del script para testear
// las reglas (quién es inactivo, qué cuenta como video) sin pegarle a prod.

export const DEFAULT_INACTIVE_MONTHS = 6;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Mes de 30 días a propósito: es un umbral de informe, no una factura. */
const MS_PER_MONTH = 30 * MS_PER_DAY;

export function fileKind(mime) {
  const value = (mime ?? "").toLowerCase();
  if (value.startsWith("video/")) return "video";
  if (value.startsWith("image/")) return "image";
  return "document";
}

export function ageBucket(createdAt, now = Date.now()) {
  if (!createdAt) return "sin_fecha";
  const age = now - new Date(createdAt).getTime();
  if (!Number.isFinite(age) || age < 0) return "sin_fecha";
  if (age < 7 * MS_PER_DAY) return "0-7d";
  if (age < 30 * MS_PER_DAY) return "7-30d";
  if (age < 90 * MS_PER_DAY) return "30-90d";
  if (age < 180 * MS_PER_DAY) return "90-180d";
  if (age < 365 * MS_PER_DAY) return "180d-1a";
  return ">1a";
}

const EMPTY_KIND = { image: 0, video: 0, document: 0 };
const EMPTY_AGE = {
  "0-7d": 0,
  "7-30d": 0,
  "30-90d": 0,
  "90-180d": 0,
  "180d-1a": 0,
  ">1a": 0,
  sin_fecha: 0,
};

/**
 * @param files  filas { user_id, mime, created_at, attached_at, bytes? }
 */
export function aggregateFiles(files, now = Date.now()) {
  const byKind = { ...EMPTY_KIND };
  const byAge = { ...EMPTY_AGE };
  const byUser = new Map();
  let attached = 0;
  let unattached = 0;

  for (const file of files) {
    const kind = fileKind(file.mime);
    byKind[kind] += 1;
    byAge[ageBucket(file.created_at, now)] += 1;
    if (file.attached_at) attached += 1;
    else unattached += 1;

    const userId = file.user_id ?? "(sin usuario)";
    const current = byUser.get(userId) ?? {
      user_id: userId,
      count: 0,
      attached: 0,
      unattached: 0,
      knownBytes: 0,
    };
    current.count += 1;
    if (file.attached_at) current.attached += 1;
    else current.unattached += 1;
    if (Number.isFinite(file.bytes) && file.bytes >= 0) current.knownBytes += file.bytes;
    byUser.set(userId, current);
  }

  const topUsers = [...byUser.values()].sort((a, b) => b.count - a.count);

  return {
    total: files.length,
    attached,
    unattached,
    byKind,
    byAge,
    topUsers,
  };
}

/**
 * Actividad = la fecha más reciente entre hilos, uso y subidas.
 * No inventa un `last_seen`: usa tablas que ya existen.
 *
 * @param events  { user_id, at }[]
 */
export function lastActivityByUser(events) {
  const map = new Map();
  for (const event of events) {
    if (!event?.user_id || !event.at) continue;
    const ms = new Date(event.at).getTime();
    if (!Number.isFinite(ms)) continue;
    const prev = map.get(event.user_id);
    if (prev == null || ms > prev) map.set(event.user_id, ms);
  }
  return map;
}

/**
 * Clasifica la whitelist de Skool (`allowed_members`) contra perfiles y
 * actividad. No recomienda borrar: solo etiqueta.
 *
 * - revoked: `is_active = false` (baja de Skool o toggle de admin).
 * - neverEntered: miembro activo sin `profiles` — nunca pasó el login.
 * - quiet: activo, sí entró, sin actividad en `inactiveMonths`.
 */
export function classifyMembers({
  members,
  profiles,
  lastActivityMsByUserId,
  now = Date.now(),
  inactiveMonths = DEFAULT_INACTIVE_MONTHS,
}) {
  const profileByEmail = new Map(
    profiles.map((profile) => [String(profile.email ?? "").toLowerCase().trim(), profile])
  );
  const cutoff = now - inactiveMonths * MS_PER_MONTH;
  const revoked = [];
  const neverEntered = [];
  const quiet = [];

  for (const member of members) {
    const email = String(member.email ?? "").toLowerCase().trim();
    if (!email) continue;
    const profile = profileByEmail.get(email);
    if (!member.is_active) {
      revoked.push({ email, userId: profile?.id ?? null });
      continue;
    }
    if (!profile) {
      neverEntered.push({ email });
      continue;
    }
    const last = lastActivityMsByUserId.get(profile.id) ?? null;
    if (last == null || last < cutoff) {
      quiet.push({ email, userId: profile.id, lastActivity: last });
    }
  }

  return { revoked, neverEntered, quiet };
}

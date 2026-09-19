// Menciones `@` de los adjuntos del hilo actual (y los que están por mandar).
//
// No es la biblioteca global ni un buscador de uploads viejos. El menú lista
// las fotos/videos/docs que YA están en esta conversación o en la bandeja del
// composer, con el mismo número que entiende el modelo. Elegir una inserta un
// token (`@Imagen 2`) en el texto; no re-adjunta el archivo.

import {
  assignThreadNumbers,
  documentLabel,
  documentMention,
  imageLabel,
  imageMention,
  videoLabel,
  videoMention,
  type AttachmentLike,
  type ThreadNumbers,
} from "./attachment-labels";

export type MentionKind = AttachmentLike["type"];

export interface MentionCandidate {
  id: string;
  kind: MentionKind;
  n: number;
  /** Chip del composer: `@Imagen 2`. */
  token: string;
  /** Lo que debe leer el modelo: `imagen 2`. */
  modelLabel: string;
  name: string;
  previewUrl?: string;
  durationSeconds?: number;
}

export type MentionSourceFile = AttachmentLike & {
  openai_file_id?: unknown;
  name?: unknown;
  previewUrl?: unknown;
  n?: unknown;
  durationSeconds?: unknown;
};

/** Token completo ya insertado: `@Imagen 12`, `@Video 1`, `@Archivo 3`. */
export const MENTION_TOKEN_RE = /@(?:Imagen|Video|Archivo)\s+\d+/g;

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function asFile(raw: unknown): MentionSourceFile | null {
  if (!raw || typeof raw !== "object") return null;
  const id = (raw as MentionSourceFile).openai_file_id;
  if (typeof id !== "string" || !id) return null;
  const type = (raw as MentionSourceFile).type;
  return {
    openai_file_id: id,
    type: type === "image" || type === "video" ? type : "document",
    name: (raw as MentionSourceFile).name,
    previewUrl: (raw as MentionSourceFile).previewUrl,
    n: (raw as MentionSourceFile).n,
    durationSeconds: (raw as MentionSourceFile).durationSeconds,
  };
}

function fileName(file: MentionSourceFile, kind: MentionKind): string {
  return typeof file.name === "string" && file.name.trim()
    ? file.name
    : kind === "image"
      ? "imagen"
      : kind === "video"
        ? "video"
        : "archivo";
}

function previewOf(file: MentionSourceFile): string | undefined {
  return typeof file.previewUrl === "string" && file.previewUrl ? file.previewUrl : undefined;
}

function durationOf(file: MentionSourceFile): number | undefined {
  const value = file.durationSeconds;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Números de documento solo para el menú `@`. El servidor no los manda al
 * modelo (los docs van por `filename`); acá sí hace falta un identificador
 * estable para poder escribir `@Archivo 2`.
 */
export function assignDocumentNumbers(
  history: { files?: unknown }[],
  outgoing: MentionSourceFile[] = []
): Map<string, number> {
  const docs = new Map<string, number>();
  let next = 1;

  const see = (raw: unknown) => {
    const file = asFile(raw);
    if (!file || file.type !== "document") return;
    const id = file.openai_file_id as string;
    if (docs.has(id)) return;
    docs.set(id, next++);
  };

  for (const { files } of history) {
    if (!Array.isArray(files)) continue;
    for (const raw of files) see(raw);
  }
  for (const file of outgoing) see(file);

  return docs;
}

function candidateFor(
  file: MentionSourceFile,
  numbers: ThreadNumbers,
  documents: Map<string, number>
): MentionCandidate | null {
  const id = file.openai_file_id as string;
  if (file.type === "image") {
    const n = numbers.images.get(id);
    if (n === undefined) return null;
    return {
      id,
      kind: "image",
      n,
      token: imageMention(n),
      modelLabel: imageLabel(n),
      name: fileName(file, "image"),
      previewUrl: previewOf(file),
    };
  }
  if (file.type === "video") {
    const n = numbers.videos.get(id);
    if (n === undefined) return null;
    return {
      id,
      kind: "video",
      n,
      token: videoMention(n),
      modelLabel: videoLabel(n),
      name: fileName(file, "video"),
      previewUrl: previewOf(file),
      durationSeconds: durationOf(file),
    };
  }
  const n = documents.get(id);
  if (n === undefined) return null;
  return {
    id,
    kind: "document",
    n,
    token: documentMention(n),
    modelLabel: documentLabel(n),
    name: fileName(file, "document"),
  };
}

/**
 * Adjuntos mencionables: primera aparición en el hilo, después los pendientes
 * de la bandeja. Un archivo re-adjuntado no se lista dos veces.
 */
function outgoingIdentified(outgoing: MentionSourceFile[]) {
  return outgoing.flatMap((file) => {
    const parsed = asFile(file);
    if (!parsed) return [];
    return [
      {
        openai_file_id: parsed.openai_file_id as string,
        type: parsed.type,
        ...(typeof parsed.n === "number" ? { n: parsed.n } : {}),
      },
    ];
  });
}

export function listMentionCandidates(
  history: { files?: unknown }[],
  outgoing: MentionSourceFile[] = [],
  numbers: ThreadNumbers = assignThreadNumbers(history, outgoingIdentified(outgoing))
): MentionCandidate[] {
  const documents = assignDocumentNumbers(history, outgoing);
  const seen = new Set<string>();
  const list: MentionCandidate[] = [];

  const add = (raw: unknown) => {
    const file = asFile(raw);
    if (!file) return;
    const id = file.openai_file_id as string;
    if (seen.has(id)) {
      const existing = list.find((item) => item.id === id);
      const preview = previewOf(file);
      const duration = durationOf(file);
      if (existing && !existing.previewUrl && preview) existing.previewUrl = preview;
      if (existing && existing.durationSeconds == null && duration != null) {
        existing.durationSeconds = duration;
      }
      return;
    }
    const candidate = candidateFor(file, numbers, documents);
    if (!candidate) return;
    seen.add(id);
    list.push(candidate);
  };

  for (const { files } of history) {
    if (!Array.isArray(files)) continue;
    for (const raw of files) add(raw);
  }
  for (const file of outgoing) add(file);

  return list;
}

/** Filtra el menú `@`. `im` encuentra `Imagen 1`; vacío lista todo. */
export function filterMentionCandidates(
  candidates: MentionCandidate[],
  query: string
): MentionCandidate[] {
  const needle = fold(query.replace(/^@/, "")).trim();
  if (!needle) return candidates;

  return candidates.filter((item) => {
    const haystacks = [item.token, item.modelLabel, item.name, String(item.n), item.kind];
    return haystacks.some((value) => fold(value).includes(needle));
  });
}

export function findCandidateByToken(
  candidates: MentionCandidate[],
  token: string
): MentionCandidate | undefined {
  const folded = fold(token);
  return (
    candidates.find((item) => fold(item.token) === folded && item.previewUrl) ??
    candidates.find((item) => fold(item.token) === folded)
  );
}

/**
 * Si el cursor está DENTRO de un token ya insertado, el menú no debe
 * reabrirse: `@Imagen 2` no es una consulta, es un chip.
 */
export function completeTokenRange(
  text: string,
  caret: number
): { start: number; end: number; token: string } | null {
  const re = new RegExp(MENTION_TOKEN_RE.source, "g");
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (caret > start && caret < end) {
      return { start, end, token: match[0] };
    }
  }
  return null;
}

export function parseMentionTokens(
  text: string
): Array<{ type: "text"; value: string } | { type: "token"; value: string }> {
  const re = new RegExp(MENTION_TOKEN_RE.source, "g");
  const parts: Array<{ type: "text"; value: string } | { type: "token"; value: string }> = [];
  let last = 0;
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    parts.push({ type: "token", value: match[0] });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

/**
 * Reemplaza los chips por el vocabulario del modelo, sin tocar el resto.
 * `@Imagen 2` → `imagen 2`. El mapeo número → file_id no cambia.
 */
export function resolveMentionTokens(text: string): string {
  return text
    .replace(/@Imagen\s+(\d+)/gi, (_, n: string) => imageLabel(Number(n)))
    .replace(/@Video\s+(\d+)/gi, (_, n: string) => videoLabel(Number(n)))
    .replace(/@Archivo\s+(\d+)/gi, (_, n: string) => documentLabel(Number(n)));
}

/**
 * Quita la consulta `@im` e inserta el token, dejando un espacio detrás
 * para seguir escribiendo sin pegarse al chip.
 */
export function insertMentionToken(
  text: string,
  mentionStart: number,
  caret: number,
  token: string
): { text: string; caret: number } {
  const after = text.slice(caret);
  const inserted = token + (after.startsWith(" ") || after.startsWith("\n") ? "" : " ");
  return {
    text: text.slice(0, mentionStart) + inserted + after,
    caret: mentionStart + inserted.length,
  };
}

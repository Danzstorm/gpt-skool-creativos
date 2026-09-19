// Lista objetos de `chat-uploads` para informe y limpieza.
//
// Primero intenta `storage.objects` por PostgREST (un scan paginado). Si el
// schema está bloqueado —pasa en algunos proyectos— cae a listar carpetas
// por la API de Storage. Las rutas del bucket son `{user_id}/{uuid}.ext`.

const PAGE = 500;

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function asObject(name, createdAt, metadata) {
  return {
    name,
    created_at: createdAt ?? null,
    bytes: numberOrNull(metadata?.size ?? metadata?.contentLength),
  };
}

/**
 * @returns {Promise<{ objects: Array<{name, created_at, bytes}>, source: string } | { objects: [], source: string, error: string }>}
 */
export async function listChatUploadObjects(supabase) {
  const viaSchema = await tryListViaSchema(supabase);
  if (viaSchema.ok) return { objects: viaSchema.objects, source: "storage.objects" };

  const viaApi = await tryListViaApi(supabase);
  if (viaApi.ok) return { objects: viaApi.objects, source: "storage.list" };

  return {
    objects: [],
    source: "none",
    error: viaApi.error ?? viaSchema.error ?? "no se pudo listar Storage",
  };
}

async function tryListViaSchema(supabase) {
  const objects = [];
  try {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .schema("storage")
        .from("objects")
        .select("name, metadata, created_at")
        .eq("bucket_id", "chat-uploads")
        .order("name", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) return { ok: false, error: error.message };
      objects.push(
        ...(data ?? []).map((row) => asObject(row.name, row.created_at, row.metadata))
      );
      if (!data || data.length < PAGE) break;
    }
    return { ok: true, objects };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function isFolder(item) {
  return item?.id == null || item?.metadata == null;
}

async function listPrefix(supabase, prefix) {
  const items = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from("chat-uploads").list(prefix, {
      limit: PAGE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    items.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return items;
}

async function tryListViaApi(supabase) {
  try {
    const objects = [];
    const root = await listPrefix(supabase, "");
    const folders = [];
    for (const item of root) {
      if (isFolder(item)) folders.push(item.name);
      else objects.push(asObject(item.name, item.created_at, item.metadata));
    }
    for (const folder of folders) {
      const items = await listPrefix(supabase, folder);
      for (const item of items) {
        if (isFolder(item)) continue;
        objects.push(asObject(`${folder}/${item.name}`, item.created_at, item.metadata));
      }
    }
    return { ok: true, objects };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function sizeByPath(objects) {
  const map = new Map();
  for (const object of objects) {
    if (!object?.name) continue;
    map.set(object.name, object.bytes);
  }
  return map;
}

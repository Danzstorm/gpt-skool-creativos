// Versiones de respuesta. Regenerar no borra la respuesta anterior: la marca
// `active = false`. Las versiones de un turno son las filas de asistente que
// hay entre un mensaje del usuario y el siguiente, en orden de creación.

export interface VersionedRow {
  role: "user" | "assistant";
  active?: boolean | null;
}

/**
 * Deja una sola respuesta por turno (la activa; si ninguna lo está, la última)
 * y adjunta a la respuesta final del hilo la lista de versiones y cuál se ve.
 * Los turnos viejos no muestran versiones: al seguir escribiendo queda fija la
 * elegida.
 */
export function collapseVersions<T extends VersionedRow>(
  rows: T[],
  textOf: (row: T) => string
): Array<T & { versions?: string[]; versionIndex?: number }> {
  const out: Array<T & { versions?: string[]; versionIndex?: number }> = [];
  let group: T[] = [];

  const flush = (isLastTurn: boolean) => {
    if (group.length === 0) return;
    let index = group.findLastIndex((row) => row.active !== false);
    if (index === -1) index = group.length - 1;
    out.push(
      isLastTurn && group.length > 1
        ? { ...group[index], versions: group.map(textOf), versionIndex: index }
        : group[index]
    );
    group = [];
  };

  for (const row of rows) {
    if (row.role === "assistant") {
      group.push(row);
    } else {
      flush(false);
      out.push(row);
    }
  }
  flush(true);
  return out;
}

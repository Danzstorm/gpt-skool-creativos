/** Tamaño de página. Por debajo del `max_rows = 1000` de supabase/config.toml. */
export const PAGE_SIZE = 500;

/**
 * Trae TODAS las filas de una consulta, paginando con `.range()`.
 *
 * PostgREST corta en `max_rows` (1000 en este proyecto) **sin avisar**: la
 * consulta devuelve 200 con las primeras mil filas y ningún indicio de que
 * falten. Eso convierte cualquier "traigo todo y comparo en memoria" en una
 * comparación contra un subconjunto arbitrario.
 *
 * Dónde dolió: la limpieza construía el set de archivos referenciados leyendo
 * `messages`. Con más de mil mensajes —producción tiene siete mil— el set
 * quedaba incompleto, así que archivos perfectamente enviados figuraban como no
 * referenciados y pasaban a ser borrables de forma irreversible.
 *
 * @param build  función que arma la consulta; recibe el rango a pedir
 */
export async function fetchAllRows(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    // Una página incompleta significa que no hay más: evita una consulta extra.
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

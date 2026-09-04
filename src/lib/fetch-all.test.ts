import { describe, expect, it } from "vitest";
import { fetchAllRows, PAGE_SIZE } from "../../scripts/lib/fetch-all.mjs";

/** Simula una tabla servida por PostgREST, que corta en max_rows sin avisar. */
function fakeTable(totalRows: number, maxRows = 1000) {
  const all = Array.from({ length: totalRows }, (_, i) => ({ id: i }));
  const calls: Array<[number, number]> = [];
  const build = async (from: number, to: number) => {
    calls.push([from, to]);
    const pedido = to - from + 1;
    // El corte de PostgREST: nunca devuelve más de maxRows, y no lo señala.
    const tope = Math.min(pedido, maxRows);
    return { data: all.slice(from, from + tope), error: null };
  };
  return { build, calls };
}

describe("fetchAllRows", () => {
  it("trae todas las filas cuando hay más que el tope de PostgREST", () => {
    // El caso real: 7208 mensajes en producción contra un max_rows de 1000.
    // Sin paginar, el set de archivos referenciados salía incompleto y
    // archivos enviados quedaban marcados como borrables.
    const { build } = fakeTable(7208);
    return expect(fetchAllRows(build)).resolves.toHaveLength(7208);
  });

  it("pide páginas por debajo del tope de PostgREST", () => {
    // Si PAGE_SIZE superara max_rows, cada página vendría cortada y el bucle
    // pararía antes de tiempo, que es exactamente el bug que se arregla.
    expect(PAGE_SIZE).toBeLessThan(1000);
  });

  it("para en la primera página incompleta, sin pedir una de más", async () => {
    const { build, calls } = fakeTable(PAGE_SIZE - 1);
    await fetchAllRows(build);
    expect(calls).toHaveLength(1);
  });

  it("con la tabla vacía devuelve vacío y consulta una sola vez", async () => {
    const { build, calls } = fakeTable(0);
    expect(await fetchAllRows(build)).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("hace una consulta extra cuando el total es múltiplo exacto del tamaño de página", async () => {
    // Con la última página llena no se sabe si hay más: hay que preguntar.
    const { build, calls } = fakeTable(PAGE_SIZE);
    expect(await fetchAllRows(build)).toHaveLength(PAGE_SIZE);
    expect(calls).toHaveLength(2);
  });

  it("propaga el error en vez de devolver una lista incompleta", async () => {
    // Devolver lo que se alcanzó a leer sería peor que fallar: quien llama lo
    // trataría como el total y borraría de más.
    const build = async () => ({ data: null, error: { message: "boom" } });
    await expect(fetchAllRows(build)).rejects.toMatchObject({ message: "boom" });
  });
});

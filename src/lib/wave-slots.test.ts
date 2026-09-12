import { describe, it, expect } from "vitest";
import { slotsForWidth, BAR_PX, GAP_PX } from "./wave-slots";

/** Ancho que ocupa la tira: n barras y n-1 separaciones. */
const stripWidth = (slots: number) => slots * BAR_PX + (slots - 1) * GAP_PX;

describe("slotsForWidth", () => {
  it("llena el ancho disponible en vez de dejar hueco muerto", () => {
    // EL BUG QUE CIERRA: con 40 ranuras fijas la tira medía 277px dentro de un
    // composer de ~620px, así que ocupaba el 45% izquierdo y la muestra más
    // nueva — anclada a la derecha de la tira — caía a mitad del chat.
    const composer = 620;
    expect(stripWidth(40)).toBe(277); // lo que pasaba antes

    const slots = slotsForWidth(composer);
    expect(stripWidth(slots)).toBeCloseTo(composer, -0.5);
  });

  it("llena el ancho también en un composer de teléfono", () => {
    const phone = 212;
    const used = stripWidth(slotsForWidth(phone));
    // Dentro de un paso de ranura: el redondeo no puede dejar un hueco visible.
    expect(Math.abs(used - phone)).toBeLessThanOrEqual(BAR_PX + GAP_PX);
  });

  it("crece con el ancho, de forma monótona", () => {
    const anchos = [120, 240, 360, 480, 600];
    const salidas = anchos.map(slotsForWidth);
    for (let i = 1; i < salidas.length; i++) {
      expect(salidas[i]).toBeGreaterThanOrEqual(salidas[i - 1]);
    }
  });

  it("acota abajo: menos de 12 barras deja de leerse como onda", () => {
    expect(slotsForWidth(10)).toBe(12);
    expect(slotsForWidth(1)).toBe(12);
  });

  it("acota arriba: no vuelve a la trama densa en pantallas anchas", () => {
    expect(slotsForWidth(5000)).toBe(96);
  });

  it("un ancho no medible devuelve el mínimo, nunca NaN", () => {
    // Pasa de verdad: el primer render mide antes del layout, y un contenedor
    // oculto informa 0. Una onda corta es preferible a una fila rota.
    for (const malo of [0, -50, NaN, Infinity]) {
      const n = slotsForWidth(malo);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBe(12);
    }
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluarVariacion, percentil } from "./desvio.js";

// 21 variations spread from 0.80 to 1.20 in steps of 0.02: P5 = 0.82 and P95 = 1.18 exactly.
const variaciones = Array.from({ length: 21 }, (_, i) => (80 + 2 * i) / 100);
const base = { variedad: "1111101", precioAnterior: 100, variaciones };

describe("percentil", () => {
  it("interpolates linearly between the closest ranks (type 7)", () => {
    const values = [10, 20, 30, 40];
    assert.equal(percentil(values, 0), 10);
    assert.equal(percentil(values, 100), 40);
    assert.equal(percentil(values, 50), 25);
    assert.ok(Math.abs((percentil(values, 25) ?? NaN) - 17.5) < 1e-9);
    assert.ok(Math.abs((percentil(values, 90) ?? NaN) - 37) < 1e-9);
  });

  it("does not need the values sorted and does not reorder them", () => {
    const values = [40, 10, 30, 20];
    assert.equal(percentil(values, 50), 25);
    assert.deepEqual(values, [40, 10, 30, 20]);
  });

  it("handles a single value and refuses an empty list", () => {
    assert.equal(percentil([7], 95), 7);
    assert.equal(percentil([], 50), null);
  });
});

describe("evaluarVariacion", () => {
  it("accepts a variation inside the usual range of the variedad", () => {
    assert.equal(evaluarVariacion({ ...base, valor: 105 }), null);
    assert.equal(evaluarVariacion({ ...base, valor: 100 }), null);
  });

  it("flags a rise and a drop outside the percentiles, with the figures to show the surveyor", () => {
    const rise = evaluarVariacion({ ...base, valor: 150 });
    assert.ok(rise);
    assert.equal(rise.metodo, "PERCENTIL_VARIACION");
    assert.equal(rise.variedad, "1111101");
    assert.equal(rise.precioAnterior, 100);
    assert.ok(Math.abs(rise.variacion - 1.5) < 1e-9);
    assert.equal(rise.percentilInferior, 5);
    assert.equal(rise.percentilSuperior, 95);
    assert.equal(rise.n, 21);
    assert.ok(Math.abs(rise.limiteInferior - 0.82) < 1e-9);
    assert.ok(Math.abs(rise.limiteSuperior - 1.18) < 1e-9);
    assert.ok(Math.abs(rise.rangoPrecio.min - 82) < 1e-9);
    assert.ok(Math.abs(rise.rangoPrecio.max - 118) < 1e-9);

    assert.ok(evaluarVariacion({ ...base, valor: 50 }));
  });

  it("includes the bounds of the band: only a variation strictly outside is flagged", () => {
    assert.equal(evaluarVariacion({ ...base, valor: 118 }), null);
    assert.ok(evaluarVariacion({ ...base, valor: 118.5 }));
    assert.equal(evaluarVariacion({ ...base, valor: 82 }), null);
    assert.ok(evaluarVariacion({ ...base, valor: 81.5 }));
  });

  it("does not judge without a previous price", () => {
    assert.equal(evaluarVariacion({ ...base, precioAnterior: null, valor: 5000 }), null);
  });

  it("does not judge a variedad with fewer variations than the minimum sample", () => {
    assert.equal(evaluarVariacion({ ...base, variaciones: variaciones.slice(0, 19), valor: 5000 }), null);
    assert.ok(evaluarVariacion({ ...base, variaciones: variaciones.slice(0, 20), valor: 5000 }));
    assert.equal(evaluarVariacion({ ...base, variaciones: [], valor: 5000 }), null);
  });

  it("never narrows the band below the minimum tolerance, even if the history is flat", () => {
    const flat = Array.from({ length: 30 }, () => 1);
    assert.equal(evaluarVariacion({ ...base, variaciones: flat, valor: 109 }), null);
    assert.equal(evaluarVariacion({ ...base, variaciones: flat, valor: 91 }), null);

    const alerta = evaluarVariacion({ ...base, variaciones: flat, valor: 112 });
    assert.ok(alerta);
    assert.ok(Math.abs(alerta.limiteInferior - 0.9) < 1e-9);
    assert.ok(Math.abs(alerta.limiteSuperior - 1.1) < 1e-9);
    assert.ok(evaluarVariacion({ ...base, variaciones: flat, valor: 88 }));
  });

  it("uses the percentiles when they are wider than the minimum tolerance", () => {
    const wide = Array.from({ length: 21 }, (_, i) => (50 + 5 * i) / 100); // 0.5 .. 1.5
    assert.equal(evaluarVariacion({ ...base, variaciones: wide, valor: 140 }), null);
    assert.ok(evaluarVariacion({ ...base, variaciones: wide, valor: 148 }));
  });

  it("allows the thresholds to be tuned", () => {
    const small = variaciones.slice(0, 10);
    assert.ok(evaluarVariacion({ ...base, variaciones: small, valor: 5000 }, { muestraMinima: 10 }));
    assert.equal(evaluarVariacion({ ...base, valor: 125 }, { toleranciaMinima: 0.3 }), null);
    assert.ok(evaluarVariacion({ ...base, valor: 125 }));

    const narrow = evaluarVariacion(
      { ...base, valor: 111 },
      { toleranciaMinima: 0, percentilInferior: 25, percentilSuperior: 75 },
    );
    assert.ok(narrow);
    assert.equal(narrow.percentilInferior, 25);
    assert.equal(narrow.percentilSuperior, 75);
    assert.ok(Math.abs(narrow.limiteSuperior - 1.1) < 1e-9);
  });

  it("does not mutate the variations it receives", () => {
    const shuffled = [...variaciones].reverse();
    const copy = [...shuffled];
    evaluarVariacion({ ...base, variaciones: shuffled, valor: 150 });
    assert.deepEqual(shuffled, copy);
  });
});

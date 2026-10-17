import { allocateProRata, bpsOf, centsToTokenUnits } from './money';

describe('money', () => {
  it('calcula puntos básicos con redondeo', () => {
    expect(bpsOf(10_000, 300)).toBe(300);
    expect(bpsOf(333, 1_250)).toBe(42);
  });

  it('convierte céntimos a unidades del stablecoin', () => {
    expect(centsToTokenUnits(12_345, 6)).toBe(123_450_000n);
    expect(centsToTokenUnits(1, 2)).toBe(1n);
    expect(() => centsToTokenUnits(1, 1)).toThrow();
  });

  it('reparte de forma proporcional y la suma cuadra', () => {
    const holders = [
      { userId: 'a', tokens: 1 },
      { userId: 'b', tokens: 1 },
      { userId: 'c', tokens: 1 },
    ];
    const out = allocateProRata(holders, 100);
    expect(out.map((o) => o.amountCents)).toEqual([34, 33, 33]);
    expect(out.reduce((s, o) => s + o.amountCents, 0)).toBe(100);
  });

  it('respeta las proporciones', () => {
    const out = allocateProRata(
      [
        { userId: 'a', tokens: 300 },
        { userId: 'b', tokens: 100 },
      ],
      400_000,
    );
    expect(out.map((o) => o.amountCents)).toEqual([300_000, 100_000]);
  });

  it('devuelve ceros sin titulares', () => {
    expect(allocateProRata([{ userId: 'a', tokens: 0 }], 100)[0].amountCents).toBe(0);
  });
});

/** Utilidades de importes. Todo se maneja en céntimos enteros para evitar errores de coma flotante. */

export function bpsOf(amountCents: number, bps: number): number {
  return Math.round((amountCents * bps) / 10_000);
}

/** Convierte céntimos de euro a unidades del stablecoin (p. ej. 6 decimales). */
export function centsToTokenUnits(cents: number, decimals: number): bigint {
  if (decimals < 2) throw new Error('El stablecoin debe tener al menos 2 decimales');
  return BigInt(cents) * 10n ** BigInt(decimals - 2);
}

/**
 * Reparte `totalCents` entre titulares en proporción a sus tokens usando el
 * método del mayor resto, de forma que la suma cuadre exactamente.
 */
export function allocateProRata<T extends { tokens: number }>(
  holders: T[],
  totalCents: number,
): Array<T & { amountCents: number }> {
  const totalTokens = holders.reduce((s, h) => s + h.tokens, 0);
  if (totalTokens === 0) return holders.map((h) => ({ ...h, amountCents: 0 }));

  const raw = holders.map((h, i) => {
    const exact = (totalCents * h.tokens) / totalTokens;
    return { i, floor: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let remaining = totalCents - raw.reduce((s, r) => s + r.floor, 0);
  const order = [...raw].sort((a, b) => b.rest - a.rest || a.i - b.i);
  const extra = new Array(holders.length).fill(0);
  for (const r of order) {
    if (remaining <= 0) break;
    extra[r.i] = 1;
    remaining--;
  }
  return holders.map((h, i) => ({ ...h, amountCents: raw[i].floor + extra[i] }));
}

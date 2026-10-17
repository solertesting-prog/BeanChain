/**
 * Códigos ISO 3166-1 alfa-2 → numérico, que es lo que guarda el
 * IdentityRegistry on-chain (uint16). Incluye los países relevantes para
 * inversores y productores; ampliar según se abran jurisdicciones.
 */
export const ISO_NUMERIC: Record<string, number> = {
  AD: 20, AE: 784, AR: 32, AT: 40, AU: 36, BE: 56, BG: 100, BO: 68, BR: 76, BY: 112,
  CA: 124, CH: 756, CL: 152, CN: 156, CO: 170, CR: 188, CU: 192, CY: 196, CZ: 203, DE: 276,
  DK: 208, DO: 214, EC: 218, EE: 233, ES: 724, FI: 246, FR: 250, GB: 826, GR: 300, GT: 320,
  HN: 340, HR: 191, HU: 348, IE: 372, IL: 376, IN: 356, IR: 364, IS: 352, IT: 380, JP: 392,
  KP: 408, KR: 410, LI: 438, LT: 440, LU: 442, LV: 428, MC: 492, MT: 470, MX: 484, NI: 558,
  NL: 528, NO: 578, NZ: 554, PA: 591, PE: 604, PL: 616, PR: 630, PT: 620, PY: 600, RO: 642,
  RU: 643, SA: 682, SE: 752, SG: 702, SI: 705, SK: 703, SV: 222, SY: 760, TR: 792, UA: 804,
  US: 840, UY: 858, VE: 862,
};

export function toIsoNumeric(alpha2: string): number {
  const code = ISO_NUMERIC[alpha2.toUpperCase()];
  if (!code) throw new Error(`País no soportado: ${alpha2}`);
  return code;
}

export function isSupportedCountry(alpha2: string): boolean {
  return alpha2.toUpperCase() in ISO_NUMERIC;
}

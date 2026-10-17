import type { DocumentType, HarvestStage, InvestmentStatus, KycStatus, OpportunityStatus } from './types';

const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const eurShort = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export const eur = (cents: number) => eurFmt.format(cents / 100);
export const eurRound = (cents: number) => eurShort.format(cents / 100);
export const pct = (bps: number) => `${(bps / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`;
export const num = (n: number) => n.toLocaleString('es-ES');

export function date(value: string | Date | null | undefined, withTime = false) {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function shortAddress(a?: string | null) {
  if (!a) return '—';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function daysLeft(value: string | null) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
}

export const STAGES: { key: HarvestStage; label: string }[] = [
  { key: 'FLOWERING', label: 'Floración y cuajado' },
  { key: 'HARVESTING', label: 'Cosecha de mazorcas' },
  { key: 'FERMENTING_DRYING', label: 'Fermentación y secado' },
  { key: 'EXPORT', label: 'Exportación' },
  { key: 'SOLD', label: 'Venta al comprador' },
  { key: 'DISTRIBUTED', label: 'Reparto a los tokens' },
];

export const stageLabel = (s: HarvestStage | null) => STAGES.find((x) => x.key === s)?.label ?? 'Pendiente de inicio';

export const OPPORTUNITY_STATUS: Record<OpportunityStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Borrador', tone: 'neutral' },
  PUBLISHED: { label: 'En captación', tone: 'green' },
  FUNDED: { label: 'Financiada', tone: 'amber' },
  ACTIVE: { label: 'En cultivo', tone: 'amber' },
  DISTRIBUTING: { label: 'En reparto', tone: 'green' },
  CLOSED: { label: 'Finalizada', tone: 'neutral' },
  CANCELLED: { label: 'Cancelada', tone: 'red' },
};

export const INVESTMENT_STATUS: Record<InvestmentStatus, { label: string; tone: Tone }> = {
  PENDING_PAYMENT: { label: 'Pendiente de pago', tone: 'amber' },
  PAID: { label: 'Pagada', tone: 'green' },
  TOKENS_ISSUED: { label: 'Tokens emitidos', tone: 'green' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
  REFUNDED: { label: 'Devuelta', tone: 'red' },
};

export const KYC_STATUS: Record<KycStatus, { label: string; tone: Tone }> = {
  NOT_STARTED: { label: 'Sin verificar', tone: 'neutral' },
  PENDING: { label: 'En revisión', tone: 'amber' },
  APPROVED: { label: 'Verificada', tone: 'green' },
  REJECTED: { label: 'Rechazada', tone: 'red' },
  EXPIRED: { label: 'Caducada', tone: 'red' },
};

export const DOCUMENT_TYPES: Record<DocumentType, string> = {
  CONTRACT: 'Contrato de prefinanciación',
  PROSPECTUS: 'Folleto informativo',
  KEY_INFO_SHEET: 'Ficha de datos fundamentales',
  AGRONOMY_REPORT: 'Informe agronómico',
  BUYER_LETTER: 'Carta del comprador',
  LAND_TITLE: 'Título de propiedad',
  INVOICE: 'Factura',
  EXPORT_PERMIT: 'Permiso de exportación',
  PHOTO: 'Foto',
  OTHER: 'Otro',
};

export const RISK_LEVEL = { LOW: 'Bajo', MEDIUM: 'Medio', HIGH: 'Alto' } as const;
export const CROP = { CACAO: 'Cacao', COFFEE: 'Café' } as const;

export type Tone = 'green' | 'amber' | 'red' | 'neutral' | 'cacao';

const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['es'], { type: 'region' }) : null;
export const countryName = (code: string) => {
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
};

/** Países ofrecidos en el registro (se pueden ampliar en la API). */
export const SIGNUP_COUNTRIES = [
  'ES', 'PT', 'FR', 'IT', 'DE', 'NL', 'BE', 'LU', 'AT', 'IE', 'FI', 'SE', 'DK', 'PL', 'CZ', 'GR', 'CH', 'GB', 'NO',
  'AD', 'MX', 'CO', 'PE', 'CL', 'AR', 'UY', 'PA', 'DO', 'EC', 'VE', 'CA', 'US',
].sort((a, b) => countryName(a).localeCompare(countryName(b), 'es'));

'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { eur } from '@/lib/format';
import { Alert, Field } from '@/components/ui';

export interface OpportunityInput {
  farmId: string;
  title: string;
  summary: string;
  description: string;
  harvestYear: number;
  tokenPriceCents: number;
  totalTokens: number;
  minTokens: number;
  maxTokensPerInvestor: number | null;
  expectedReturnBps: number;
  termMonths: number;
  platformFeeBps: number;
  buyerName: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  risks: string[];
  opensAt: string;
  closesAt: string;
  expectedPayoutAt: string;
  blockedCountries: string[];
  maxHolders: number | null;
  tokenSymbol: string;
  coverImageUrl: string;
}

const toDateInput = (v?: string | null) => (v ? v.slice(0, 10) : '');
const toIso = (v: string) => (v ? new Date(`${v}T12:00:00Z`).toISOString() : undefined);

export function OpportunityForm({
  farms,
  initial,
  opportunityId,
  locked,
  onSaved,
}: {
  farms: { id: string; name: string }[];
  initial?: Partial<OpportunityInput>;
  opportunityId?: string;
  /** Tras publicar, las condiciones económicas no se pueden cambiar. */
  locked?: boolean;
  onSaved: (id: string) => void;
}) {
  const year = new Date().getFullYear() + 1;
  const [f, setF] = useState({
    farmId: initial?.farmId ?? farms[0]?.id ?? '',
    title: initial?.title ?? '',
    summary: initial?.summary ?? '',
    description: initial?.description ?? '',
    harvestYear: String(initial?.harvestYear ?? year),
    tokenPrice: String((initial?.tokenPriceCents ?? 10_000) / 100),
    totalTokens: String(initial?.totalTokens ?? 1000),
    minTokens: String(initial?.minTokens ?? 1),
    maxTokensPerInvestor: initial?.maxTokensPerInvestor ? String(initial.maxTokensPerInvestor) : '',
    expectedReturn: String((initial?.expectedReturnBps ?? 1200) / 100),
    termMonths: String(initial?.termMonths ?? 12),
    platformFee: String((initial?.platformFeeBps ?? 300) / 100),
    buyerName: initial?.buyerName ?? '',
    riskLevel: initial?.riskLevel ?? 'HIGH',
    risks: (initial?.risks ?? ['Clima y plagas', 'Precio del cacao', 'Permisos de exportación', 'Sanciones y riesgo país', 'Baja liquidez']).join('\n'),
    opensAt: toDateInput(initial?.opensAt),
    closesAt: toDateInput(initial?.closesAt),
    expectedPayoutAt: toDateInput(initial?.expectedPayoutAt),
    blockedCountries: (initial?.blockedCountries ?? ['US']).join(', '),
    maxHolders: initial?.maxHolders ? String(initial.maxHolders) : '',
    tokenSymbol: initial?.tokenSymbol ?? '',
    coverImageUrl: initial?.coverImageUrl ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  const n = (v: string) => Number(v.replace(',', '.'));
  const priceCents = Math.round(n(f.tokenPrice) * 100);
  const target = priceCents * (Number(f.totalTokens) || 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const text: Record<string, unknown> = {
      title: f.title,
      summary: f.summary,
      description: f.description,
      buyerName: f.buyerName || undefined,
      riskLevel: f.riskLevel,
      risks: f.risks.split('\n').map((r) => r.trim()).filter(Boolean),
      opensAt: toIso(f.opensAt),
      closesAt: toIso(f.closesAt),
      expectedPayoutAt: toIso(f.expectedPayoutAt),
      coverImageUrl: f.coverImageUrl || undefined,
    };
    const economics: Record<string, unknown> = {
      tokenPriceCents: priceCents,
      totalTokens: Number(f.totalTokens),
      minTokens: Number(f.minTokens) || 1,
      maxTokensPerInvestor: f.maxTokensPerInvestor ? Number(f.maxTokensPerInvestor) : undefined,
      expectedReturnBps: Math.round(n(f.expectedReturn) * 100),
      termMonths: Number(f.termMonths),
      platformFeeBps: Math.round(n(f.platformFee) * 100),
      blockedCountries: f.blockedCountries.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean),
      maxHolders: f.maxHolders ? Number(f.maxHolders) : undefined,
    };
    const body = opportunityId
      ? { ...text, ...(locked ? {} : economics) }
      : { ...text, ...economics, farmId: f.farmId, harvestYear: Number(f.harvestYear), tokenSymbol: f.tokenSymbol.toUpperCase() };

    setBusy(true);
    try {
      const res = await api<{ id: string }>(opportunityId ? `/admin/opportunities/${opportunityId}` : '/admin/opportunities', {
        method: opportunityId ? 'PATCH' : 'POST',
        body,
      });
      onSaved(res.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido guardar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-5 p-5" noValidate>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="section-title mb-2">Presentación</legend>
        {!opportunityId && (
          <Field label="Finca" htmlFor="o-farm">
            <select id="o-farm" className="input" value={f.farmId} onChange={set('farmId')}>
              {farms.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {!opportunityId && (
          <Field label="Año de cosecha" htmlFor="o-year">
            <input id="o-year" inputMode="numeric" className="input" value={f.harvestYear} onChange={set('harvestYear')} />
          </Field>
        )}
        <div className="sm:col-span-2">
          <Field label="Título" htmlFor="o-title">
            <input id="o-title" className="input" value={f.title} onChange={set('title')} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Resumen (una o dos frases)" htmlFor="o-sum">
            <input id="o-sum" className="input" value={f.summary} onChange={set('summary')} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Descripción" htmlFor="o-desc" hint="Destino del capital, contrato con el comprador, calendario y cálculo del rendimiento.">
            <textarea id="o-desc" rows={7} className="input" value={f.description} onChange={set('description')} />
          </Field>
        </div>
        <Field label="Comprador comprometido" htmlFor="o-buyer">
          <input id="o-buyer" className="input" value={f.buyerName} onChange={set('buyerName')} />
        </Field>
        <Field label="URL de la imagen de portada" htmlFor="o-cover">
          <input id="o-cover" className="input" value={f.coverImageUrl} onChange={set('coverImageUrl')} placeholder="https://…" />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3" disabled={locked}>
        <legend className="section-title mb-2">Condiciones económicas {locked && <span className="text-sm text-muted">(bloqueadas tras publicar)</span>}</legend>
        <Field label="Precio por token (€)" htmlFor="o-price">
          <input id="o-price" inputMode="decimal" className="input" value={f.tokenPrice} onChange={set('tokenPrice')} />
        </Field>
        <Field label="Tokens emitidos" htmlFor="o-total" hint={`Objetivo: ${eur(target)}`}>
          <input id="o-total" inputMode="numeric" className="input" value={f.totalTokens} onChange={set('totalTokens')} />
        </Field>
        <Field label="Rentabilidad estimada (%)" htmlFor="o-ret">
          <input id="o-ret" inputMode="decimal" className="input" value={f.expectedReturn} onChange={set('expectedReturn')} />
        </Field>
        <Field label="Mínimo por inversor (tokens)" htmlFor="o-min">
          <input id="o-min" inputMode="numeric" className="input" value={f.minTokens} onChange={set('minTokens')} />
        </Field>
        <Field label="Máximo por inversor (tokens)" htmlFor="o-max" hint="Vacío = sin límite">
          <input id="o-max" inputMode="numeric" className="input" value={f.maxTokensPerInvestor} onChange={set('maxTokensPerInvestor')} />
        </Field>
        <Field label="Plazo (meses)" htmlFor="o-term">
          <input id="o-term" inputMode="numeric" className="input" value={f.termMonths} onChange={set('termMonths')} />
        </Field>
        <Field label="Comisión de la plataforma (%)" htmlFor="o-fee">
          <input id="o-fee" inputMode="decimal" className="input" value={f.platformFee} onChange={set('platformFee')} />
        </Field>
        <Field label="Máximo de titulares" htmlFor="o-holders" hint="Para exenciones de folleto. Vacío = sin límite">
          <input id="o-holders" inputMode="numeric" className="input" value={f.maxHolders} onChange={set('maxHolders')} />
        </Field>
        <Field label="Países excluidos (ISO)" htmlFor="o-blocked" hint="Además de los bloqueados globalmente">
          <input id="o-blocked" className="input" value={f.blockedCountries} onChange={set('blockedCountries')} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="section-title mb-2">Calendario y riesgo</legend>
        <Field label="Apertura" htmlFor="o-open" hint="Vacío = al publicar">
          <input id="o-open" type="date" className="input" value={f.opensAt} onChange={set('opensAt')} />
        </Field>
        <Field label="Cierre de la captación" htmlFor="o-close">
          <input id="o-close" type="date" className="input" value={f.closesAt} onChange={set('closesAt')} />
        </Field>
        <Field label="Pago estimado" htmlFor="o-payout">
          <input id="o-payout" type="date" className="input" value={f.expectedPayoutAt} onChange={set('expectedPayoutAt')} />
        </Field>
        <Field label="Nivel de riesgo" htmlFor="o-risk">
          <select id="o-risk" className="input" value={f.riskLevel} onChange={set('riskLevel')}>
            <option value="LOW">Bajo</option>
            <option value="MEDIUM">Medio</option>
            <option value="HIGH">Alto</option>
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Riesgos principales" htmlFor="o-risks" hint="Uno por línea">
            <textarea id="o-risks" rows={5} className="input" value={f.risks} onChange={set('risks')} />
          </Field>
        </div>
      </fieldset>

      {!opportunityId && (
        <Field label="Símbolo del token" htmlFor="o-sym" hint="3-16 caracteres en mayúsculas, p. ej. CAC-CHU-27. No se puede cambiar.">
          <input id="o-sym" className="input w-56 uppercase" value={f.tokenSymbol} onChange={set('tokenSymbol')} />
        </Field>
      )}

      {error && <Alert tone="red">{error}</Alert>}
      <button type="submit" className="btn-primary w-fit" disabled={busy}>
        {busy ? 'Guardando…' : opportunityId ? 'Guardar cambios' : 'Crear borrador'}
      </button>
    </form>
  );
}

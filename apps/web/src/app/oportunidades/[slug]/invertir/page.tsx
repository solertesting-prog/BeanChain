'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import type { CreatedInvestment, OpportunityDetail } from '@/lib/types';
import { date, eur, num, pct } from '@/lib/format';
import { Alert, CopyButton, Field, PageHeader, Row, Spinner } from '@/components/ui';
import { RequireAuth } from '@/components/require-auth';

interface Quote {
  ok: boolean;
  code?: string;
  message?: string;
  amountCents: number;
  retailWarning: boolean;
}

type Method = 'BANK_TRANSFER' | 'CARD';

function InvestFlow() {
  const { slug } = useParams<{ slug: string }>();
  const { data: o, loading, error } = useApi<OpportunityDetail>(`/opportunities/${slug}`);
  const [tokens, setTokens] = useState(1);
  const [method, setMethod] = useState<Method>('BANK_TRANSFER');
  const [riskAck, setRiskAck] = useState(false);
  const [retailAck, setRetailAck] = useState(false);
  const [netWorth, setNetWorth] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedInvestment | null>(null);

  useEffect(() => {
    if (o) setTokens((t) => Math.max(t, o.minTokens));
  }, [o]);

  const netWorthCents = netWorth.trim() ? Math.round(Number(netWorth.replace(/\./g, '').replace(',', '.')) * 100) : undefined;
  const payload = o && {
    opportunityId: o.id,
    tokens,
    paymentMethod: method,
    riskAcknowledged: true,
    acknowledgeRetailLimit: retailAck,
    ...(netWorthCents !== undefined && Number.isFinite(netWorthCents) ? { netWorthCents } : {}),
  };

  // Simula la inversión al cambiar la cantidad para avisar antes de enviar.
  useEffect(() => {
    if (!payload || tokens < 1) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<Quote>('/investments/quote', { method: 'POST', body: payload, signal: ctrl.signal })
        .then(setQuote)
        .catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o?.id, tokens, method, retailAck, netWorthCents]);

  if (loading) return <Spinner />;
  if (error || !o) return <Alert tone="red" title="No se puede cargar la oportunidad">{error?.message}</Alert>;

  if (result) return <PaymentInstructions inv={result} o={o} />;

  const max = Math.min(o.stats.tokensAvailable, o.maxTokensPerInvestor ?? Infinity);
  const amount = tokens * o.tokenPriceCents;
  const expected = Math.round(amount * (1 + o.expectedReturnBps / 10_000));
  const needsRetailAck = quote?.code === 'RETAIL_LIMIT_ACK_REQUIRED' || quote?.retailWarning;
  const blocking = quote && !quote.ok && quote.code !== 'RETAIL_LIMIT_ACK_REQUIRED' && quote.code !== 'RISK_NOT_ACKNOWLEDGED';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!riskAck) {
      setSubmitError('Confirma que has leído la información y los riesgos.');
      return;
    }
    if (needsRetailAck && !retailAck) {
      setSubmitError('Confirma expresamente el aviso para inversores minoristas.');
      return;
    }
    setSubmitting(true);
    try {
      const inv = await api<CreatedInvestment>('/investments', { method: 'POST', body: payload });
      if (inv.paymentInstructions.method === 'CARD' && inv.paymentInstructions.checkoutUrl) {
        window.location.href = inv.paymentInstructions.checkoutUrl;
        return;
      }
      setResult(inv);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'No se ha podido completar la reserva');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Invertir" sub={o.title} back={{ href: `/oportunidades/${o.slug}`, label: 'Volver a la ficha' }} />

      <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
        <section className="card flex flex-col gap-4 p-5" aria-labelledby="cantidad">
          <h2 id="cantidad" className="section-title">
            1. ¿Cuántos tokens?
          </h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-secondary h-12 w-12 px-0 text-xl"
              aria-label="Un token menos"
              onClick={() => setTokens((t) => Math.max(o.minTokens, t - 1))}
            >
              −
            </button>
            <label htmlFor="tokens" className="sr-only">
              Número de tokens
            </label>
            <input
              id="tokens"
              type="number"
              inputMode="numeric"
              min={o.minTokens}
              max={Number.isFinite(max) ? max : undefined}
              value={tokens}
              onChange={(e) => setTokens(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="input h-12 w-28 text-center text-lg font-semibold"
            />
            <button
              type="button"
              className="btn-secondary h-12 w-12 px-0 text-xl"
              aria-label="Un token más"
              onClick={() => setTokens((t) => Math.min(Number.isFinite(max) ? max : t + 1, t + 1))}
            >
              +
            </button>
            <span className="text-sm text-muted">× {eur(o.tokenPriceCents)}</span>
          </div>
          <div className="rounded-xl bg-ground px-4 py-1">
            <Row label="Importe a pagar">{eur(amount)}</Row>
            <Row label={`Estimado al final (${pct(o.expectedReturnBps)})`}>{eur(expected)}</Row>
            <Row label="Disponibles" last>
              {num(o.stats.tokensAvailable)} tokens
              {o.maxTokensPerInvestor ? ` · máx. ${num(o.maxTokensPerInvestor)} por inversor` : ''}
            </Row>
          </div>
          {blocking && <Alert tone="red">{quote?.message}</Alert>}
        </section>

        <section className="card flex flex-col gap-3 p-5" aria-labelledby="pago">
          <h2 id="pago" className="section-title">
            2. Forma de pago
          </h2>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Forma de pago</legend>
            {(
              [
                ['BANK_TRANSFER', 'Transferencia bancaria (SEPA)', 'Sin comisiones. Reservamos tus tokens durante 72 horas.'],
                ['CARD', 'Tarjeta', 'Pago inmediato a través de nuestra pasarela.'],
              ] as const
            ).map(([key, label, sub]) => (
              <label
                key={key}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${method === key ? 'border-leaf bg-leaf-light/40' : 'border-line'}`}
              >
                <input type="radio" name="method" value={key} checked={method === key} onChange={() => setMethod(key)} className="mt-1 h-4 w-4 accent-[#2E6A4B]" />
                <span>
                  <span className="block font-medium">{label}</span>
                  <span className="block text-sm text-muted">{sub}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className="card flex flex-col gap-4 p-5" aria-labelledby="decl">
          <h2 id="decl" className="section-title">
            3. Confirmaciones
          </h2>
          <Field
            label="Patrimonio neto aproximado (opcional, €)"
            htmlFor="networth"
            hint="Si eres inversor minorista, te avisaremos si inviertes más del 5 % de tu patrimonio en esta cosecha."
          >
            <input id="networth" inputMode="decimal" className="input" value={netWorth} onChange={(e) => setNetWorth(e.target.value)} placeholder="Por ejemplo, 60.000" />
          </Field>

          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={riskAck} onChange={(e) => setRiskAck(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-[#2E6A4B]" />
            <span>
              He leído la ficha de datos fundamentales y los <Link href="/riesgos">riesgos</Link>. Entiendo que puedo perder todo el
              capital invertido, que la rentabilidad no está garantizada y que puede que no pueda vender mis tokens antes del vencimiento.
            </span>
          </label>

          {needsRetailAck && (
            <div className="rounded-xl bg-amber-soft p-4 text-sm text-amber-text">
              <p className="font-semibold">Aviso para inversores minoristas</p>
              <p className="mt-1">
                Vas a invertir más de 1.000 € o más del 5 % de tu patrimonio neto en un único proyecto. Esto aumenta tu riesgo de
                pérdida. Antes de continuar debes confirmarlo expresamente.
              </p>
              <label className="mt-3 flex items-start gap-3">
                <input type="checkbox" checked={retailAck} onChange={(e) => setRetailAck(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-[#6E3F07]" />
                <span>Entiendo el aviso y quiero invertir esta cantidad.</span>
              </label>
            </div>
          )}
        </section>

        {submitError && <Alert tone="red">{submitError}</Alert>}

        <div className="flex flex-col gap-2">
          <button type="submit" className="btn-primary h-[52px]" disabled={submitting || tokens < o.minTokens || Boolean(blocking)}>
            {submitting ? 'Reservando…' : `Reservar ${num(tokens)} token${tokens === 1 ? '' : 's'} por ${eur(amount)}`}
          </button>
          <p className="text-center text-xs text-muted">Los tokens se emiten en tu wallet al confirmar el pago.</p>
        </div>
      </form>
    </div>
  );
}

function PaymentInstructions({ inv, o }: { inv: CreatedInvestment; o: OpportunityDetail }) {
  const p = inv.paymentInstructions;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader title="Reserva confirmada" sub={`${num(inv.tokens)} tokens de ${o.title}`} />
      {p.method === 'BANK_TRANSFER' ? (
        <>
          <Alert tone="amber" title={`Haz la transferencia antes del ${date(p.expiresAt, true)}`}>
            Si no recibimos el pago a tiempo, la reserva se anula automáticamente. Incluye el concepto exactamente como aparece.
          </Alert>
          <div className="card px-5 py-2">
            <Row label="Importe">{eur(p.amountCents)}</Row>
            <Row label="Beneficiario">{p.beneficiary}</Row>
            <Row label="IBAN">
              <span className="inline-flex items-center gap-1 font-mono text-sm">
                {p.iban}
                <CopyButton value={p.iban.replace(/\s/g, '')} />
              </span>
            </Row>
            <Row label="BIC">{p.bic}</Row>
            <Row label="Concepto" last>
              <span className="inline-flex items-center gap-1 font-mono text-sm">
                {p.reference}
                <CopyButton value={p.reference} />
              </span>
            </Row>
          </div>
          <p className="text-sm text-muted">Te hemos enviado estos datos por correo. Cuando concilien el pago, verás los tokens en tu cartera.</p>
        </>
      ) : (
        <Alert tone="green" title="Redirigiendo a la pasarela de pago…" />
      )}
      <div className="flex flex-wrap gap-3">
        <Link href="/cartera" className="btn-primary">
          Ir a mi cartera
        </Link>
        <Link href={`/oportunidades/${o.slug}`} className="btn-secondary">
          Volver a la ficha
        </Link>
      </div>
    </div>
  );
}

export default function InvestPage() {
  return <RequireAuth>{() => <InvestFlow />}</RequireAuth>;
}

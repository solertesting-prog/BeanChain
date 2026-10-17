'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { INVESTMENT_STATUS, date, eur, num } from '@/lib/format';
import type { InvestmentStatus } from '@/lib/types';
import { Alert, Badge, PageHeader, Spinner } from '@/components/ui';

interface Row {
  id: string;
  tokens: number;
  amountCents: number;
  status: InvestmentStatus;
  paymentMethod: string;
  paymentReference: string;
  createdAt: string;
  expiresAt: string;
  opportunityId: string;
  user: { id: string; email: string; firstName: string; lastName: string };
  opportunity: { title: string; slug: string; tokenSymbol: string };
}

function Reconcile({ onDone }: { onDone: () => void }) {
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [bankRef, setBankRef] = useState('');
  const [found, setFound] = useState<{ id: string; amountCents: number; status: InvestmentStatus; tokens: number } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'green' | 'red' | 'amber'; text: string } | null>(null);
  const cents = Math.round(Number(amount.replace(/\./g, '').replace(',', '.')) * 100) || 0;

  return (
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="section-title">Conciliar una transferencia</h2>
      <p className="text-sm text-muted">Busca por el concepto que puso el inversor (BC-XXXXXXXX) y confirma el importe recibido.</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <label>
          <span className="label">Concepto</span>
          <input className="input font-mono uppercase" value={reference} onChange={(e) => { setReference(e.target.value); setFound(null); }} />
        </label>
        <label>
          <span className="label">Importe recibido (€)</span>
          <input inputMode="decimal" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          <span className="label">Ref. del movimiento</span>
          <input className="input" value={bankRef} onChange={(e) => setBankRef(e.target.value)} />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={!reference.trim()}
            onClick={async () => {
              setMsg(null);
              try {
                setFound(await api(`/admin/investments/by-reference/${encodeURIComponent(reference.trim())}`));
              } catch (err) {
                setFound(null);
                setMsg({ tone: 'red', text: err instanceof ApiError ? err.message : 'No encontrada' });
              }
            }}
          >
            Buscar
          </button>
        </div>
      </div>
      {found && (
        <Alert tone={found.status === 'PENDING_PAYMENT' ? 'neutral' : 'amber'}>
          {num(found.tokens)} tokens · esperado {eur(found.amountCents)} · {INVESTMENT_STATUS[found.status].label}
          {cents > 0 && cents !== found.amountCents && <div className="mt-1 font-semibold text-danger-text">El importe no coincide con el esperado.</div>}
        </Alert>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <button
        type="button"
        className="btn-primary w-fit"
        disabled={!found || found.status !== 'PENDING_PAYMENT' || cents <= 0 || !bankRef.trim()}
        onClick={async () => {
          setMsg(null);
          try {
            await api(`/admin/investments/${found!.id}/confirm-payment`, { method: 'POST', body: { amountCents: cents, bankReference: bankRef.trim() } });
            setMsg({ tone: 'green', text: 'Pago conciliado y tokens emitidos' });
            setFound(null);
            setReference('');
            setAmount('');
            setBankRef('');
            onDone();
          } catch (err) {
            setMsg({ tone: 'red', text: err instanceof ApiError ? err.message : 'Error' });
          }
        }}
      >
        Confirmar cobro y emitir tokens
      </button>
    </section>
  );
}

export default function AdminInvestmentsPage() {
  const [status, setStatus] = useState<InvestmentStatus | ''>('PENDING_PAYMENT');
  const { data, loading, reload } = useApi<{ items: Row[]; total: number }>(`/admin/investments${status ? `?status=${status}` : ''}`);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Inversiones y cobros" />
      <Reconcile onDone={reload} />
      <div className="flex flex-wrap gap-2">
        {(['PENDING_PAYMENT', 'TOKENS_ISSUED', 'PAID', 'CANCELLED', 'REFUNDED', ''] as const).map((s) => (
          <button
            key={s || 'all'}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={`min-h-[40px] rounded-full border px-4 text-sm ${status === s ? 'border-ink bg-ink text-ground' : 'border-line bg-white'}`}
          >
            {s ? INVESTMENT_STATUS[s].label : 'Todas'}
          </button>
        ))}
      </div>
      {loading ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Inversor</th>
                <th scope="col">Oportunidad</th>
                <th scope="col">Tokens</th>
                <th scope="col">Importe</th>
                <th scope="col">Concepto</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((i) => (
                <tr key={i.id}>
                  <td>{date(i.createdAt, true)}</td>
                  <td>
                    {i.user.firstName} {i.user.lastName}
                    <div className="text-xs text-muted">{i.user.email}</div>
                  </td>
                  <td>
                    <Link href={`/admin/oportunidades/${i.opportunityId}`}>{i.opportunity.title}</Link>
                  </td>
                  <td>{num(i.tokens)}</td>
                  <td>{eur(i.amountCents)}</td>
                  <td className="font-mono text-xs">{i.paymentReference}</td>
                  <td>
                    <Badge tone={INVESTMENT_STATUS[i.status].tone}>{INVESTMENT_STATUS[i.status].label}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.items.length === 0 && <p className="p-4 text-sm text-muted">No hay inversiones con este estado.</p>}
        </div>
      )}
    </div>
  );
}

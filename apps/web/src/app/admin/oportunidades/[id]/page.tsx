'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError, openDocument } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import {
  DOCUMENT_TYPES,
  INVESTMENT_STATUS,
  OPPORTUNITY_STATUS,
  STAGES,
  date,
  eur,
  num,
  shortAddress,
  stageLabel,
} from '@/lib/format';
import type { DocumentType, HarvestStage, InvestmentStatus, OpportunityStatus } from '@/lib/types';
import { Alert, Badge, PageHeader, ProgressBar, Row, Spinner, Stat } from '@/components/ui';
import { DocumentUpload } from '@/components/admin/document-upload';
import { OpportunityForm, OpportunityInput } from '@/components/admin/opportunity-form';

interface AdminOpportunity extends OpportunityInput {
  id: string;
  slug: string;
  status: OpportunityStatus;
  targetAmountCents: number;
  tokenName: string;
  tokenAddress: string | null;
  complianceAddress: string | null;
  deployTxHash: string | null;
  publishedAt: string | null;
  farm: { id: string; name: string };
  stats: { tokensSold: number; tokensReserved: number; tokensAvailable: number; raisedCents: number; investorsCount: number; progressPct: number };
  publishChecklist: { ready: boolean; items: { key: string; ok: boolean; label: string; missing?: string[] }[] };
  documents: { id: string; title: string; type: DocumentType; visibility: string; createdAt: string; anchoredTxHash: string | null; sha256: string }[];
  updates: { id: string; stage: HarvestStage; title: string; body: string; publishedAt: string }[];
  distributions: { id: string; kind: string; totalAmountCents: number; status: string; createdAt: string; executedAt: string | null; txHash: string | null; error: string | null }[];
  investments: {
    id: string;
    tokens: number;
    amountCents: number;
    status: InvestmentStatus;
    paymentMethod: string;
    paymentReference: string;
    createdAt: string;
    expiresAt: string;
    user: { id: string; email: string; firstName: string; lastName: string; country: string };
  }[];
}

const NEXT_STATUS: Partial<Record<OpportunityStatus, { to: OpportunityStatus; label: string; danger?: boolean }[]>> = {
  PUBLISHED: [
    { to: 'FUNDED', label: 'Cerrar captación' },
    { to: 'CANCELLED', label: 'Cancelar y devolver', danger: true },
  ],
  FUNDED: [
    { to: 'ACTIVE', label: 'Marcar cosecha en curso' },
    { to: 'CANCELLED', label: 'Cancelar y devolver', danger: true },
  ],
  ACTIVE: [{ to: 'DISTRIBUTING', label: 'Pasar a reparto' }],
  DISTRIBUTING: [{ to: 'CLOSED', label: 'Finalizar y cerrar el token' }],
  DRAFT: [{ to: 'CANCELLED', label: 'Descartar borrador', danger: true }],
};

function useAction(reload: () => Promise<void>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'green', text: ok });
      await reload();
    } catch (err) {
      setMsg({ tone: 'red', text: err instanceof ApiError ? err.message : 'Error' });
    } finally {
      setBusy(null);
    }
  }
  return { busy, msg, run };
}

function Lifecycle({ o, reload }: { o: AdminOpportunity; reload: () => Promise<void> }) {
  const { busy, msg, run } = useAction(reload);
  const actions = NEXT_STATUS[o.status] ?? [];
  return (
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="section-title">Ciclo de vida</h2>
      {o.status === 'DRAFT' && (
        <>
          <ul className="flex flex-col gap-1.5 text-sm">
            {o.publishChecklist.items.map((i) => (
              <li key={i.key} className="flex items-start gap-2">
                <span aria-hidden="true" className={i.ok ? 'text-leaf' : 'text-danger-text'}>
                  {i.ok ? '✓' : '✗'}
                </span>
                <span>
                  {i.label}
                  {i.missing && i.missing.length > 0 && <span className="text-muted"> · falta: {i.missing.join(', ')}</span>}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-primary w-fit"
            disabled={!o.publishChecklist.ready || busy !== null}
            onClick={() => run('publish', () => api(`/admin/opportunities/${o.id}/publish`, { method: 'POST' }), 'Publicada y token desplegado')}
          >
            {busy === 'publish' ? 'Desplegando token…' : 'Publicar y desplegar el token'}
          </button>
        </>
      )}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions
            .filter((a) => !(o.status === 'DRAFT' && !a.danger && a.to !== 'CANCELLED'))
            .map((a) => (
              <button
                key={a.to}
                type="button"
                className={a.danger ? 'btn-secondary text-danger-text' : 'btn-secondary'}
                disabled={busy !== null}
                onClick={() => {
                  if (a.danger && !window.confirm(`¿Seguro? ${a.label}. Esta acción no se puede deshacer.`)) return;
                  void run(a.to, () => api(`/admin/opportunities/${o.id}/transition`, { method: 'POST', body: { to: a.to } }), `Estado: ${OPPORTUNITY_STATUS[a.to].label}`);
                }}
              >
                {a.label}
              </button>
            ))}
        </div>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </section>
  );
}

function Investments({ o, reload }: { o: AdminOpportunity; reload: () => Promise<void> }) {
  const { busy, msg, run } = useAction(reload);
  const [bankRef, setBankRef] = useState<Record<string, string>>({});
  return (
    <section className="flex flex-col gap-3">
      <h2 className="section-title">Inversiones</h2>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {o.investments.length === 0 ? (
        <p className="text-sm text-muted">Sin inversiones todavía.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Inversor</th>
                <th scope="col">Tokens</th>
                <th scope="col">Importe</th>
                <th scope="col">Referencia</th>
                <th scope="col">Estado</th>
                <th scope="col">Acción</th>
              </tr>
            </thead>
            <tbody>
              {o.investments.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.user.firstName} {i.user.lastName}
                    <div className="text-xs text-muted">{i.user.email}</div>
                  </td>
                  <td>{num(i.tokens)}</td>
                  <td>{eur(i.amountCents)}</td>
                  <td className="font-mono text-xs">{i.paymentReference}</td>
                  <td>
                    <Badge tone={INVESTMENT_STATUS[i.status].tone}>{INVESTMENT_STATUS[i.status].label}</Badge>
                    {i.status === 'PENDING_PAYMENT' && <div className="mt-1 text-xs text-muted">caduca {date(i.expiresAt, true)}</div>}
                  </td>
                  <td>
                    {i.status === 'PENDING_PAYMENT' && i.paymentMethod === 'BANK_TRANSFER' && (
                      <div className="flex min-w-[220px] gap-1">
                        <input
                          aria-label="Referencia del movimiento bancario"
                          placeholder="Ref. del banco"
                          className="input min-h-[36px] py-1 text-sm"
                          value={bankRef[i.id] ?? ''}
                          onChange={(e) => setBankRef((r) => ({ ...r, [i.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          className="btn-primary min-h-[36px] px-3 text-sm"
                          disabled={!bankRef[i.id] || busy !== null}
                          onClick={() =>
                            run(
                              i.id,
                              () =>
                                api(`/admin/investments/${i.id}/confirm-payment`, {
                                  method: 'POST',
                                  body: { amountCents: i.amountCents, bankReference: bankRef[i.id] },
                                }),
                              'Pago conciliado y tokens emitidos',
                            )
                          }
                        >
                          Cobrado
                        </button>
                      </div>
                    )}
                    {i.status === 'PAID' && (
                      <button
                        type="button"
                        className="btn-secondary min-h-[36px] px-3 text-sm"
                        disabled={busy !== null}
                        onClick={() => run(i.id, () => api(`/admin/investments/${i.id}/issue`, { method: 'POST' }), 'Tokens emitidos')}
                      >
                        Reintentar emisión
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Updates({ o, reload }: { o: AdminOpportunity; reload: () => Promise<void> }) {
  const { busy, msg, run } = useAction(reload);
  const [stage, setStage] = useState<HarvestStage>(o.updates[0]?.stage ?? 'FLOWERING');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  return (
    <section className="flex flex-col gap-3">
      <h2 className="section-title">Novedades de la cosecha</h2>
      <form
        className="card flex flex-col gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            'update',
            async () => {
              await api(`/admin/opportunities/${o.id}/updates`, { method: 'POST', body: { stage, title, body } });
              setTitle('');
              setBody('');
            },
            'Novedad publicada y notificada a los inversores',
          );
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
          <label>
            <span className="label">Etapa</span>
            <select className="input" value={stage} onChange={(e) => setStage(e.target.value as HarvestStage)}>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Título</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
        </div>
        <label>
          <span className="label">Texto</span>
          <textarea rows={4} className="input" value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <button type="submit" className="btn-primary w-fit" disabled={busy !== null || title.length < 3 || body.length < 10}>
          Publicar novedad
        </button>
      </form>
      {o.updates.length > 0 && (
        <ul className="flex flex-col gap-2">
          {o.updates.map((u) => (
            <li key={u.id} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{u.title}</span>
                <button
                  type="button"
                  className="btn-ghost min-h-[32px] text-xs"
                  onClick={() => {
                    if (window.confirm('¿Borrar esta novedad?')) void run(u.id, () => api(`/admin/updates/${u.id}`, { method: 'DELETE' }), 'Novedad borrada');
                  }}
                >
                  Borrar
                </button>
              </div>
              <div className="text-xs text-muted">
                {date(u.publishedAt, true)} · {stageLabel(u.stage)}
              </div>
              <p className="mt-1 whitespace-pre-line text-sm">{u.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Distributions({ o, reload }: { o: AdminOpportunity; reload: () => Promise<void> }) {
  const { busy, msg, run } = useAction(reload);
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<'PROFIT' | 'PRINCIPAL' | 'FINAL'>('FINAL');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<{ totalTokens: number; holders: number; perTokenCents: number } | null>(null);
  const cents = Math.round(Number(amount.replace(/\./g, '').replace(',', '.')) * 100) || 0;
  const canDistribute = o.status === 'ACTIVE' || o.status === 'DISTRIBUTING';

  return (
    <section className="flex flex-col gap-3">
      <h2 className="section-title">Repartos</h2>
      {!canDistribute ? (
        <p className="text-sm text-muted">Los repartos se habilitan cuando la cosecha está en curso o en reparto.</p>
      ) : (
        <div className="card flex flex-col gap-3 p-4">
          <p className="text-sm text-muted">
            El operador debe tener en su wallet el stablecoin equivalente al importe. El contrato lo reparte entre los titulares y
            empuja el pago a las wallets custodiadas.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className="label">Importe total (€)</span>
              <input inputMode="decimal" className="input" value={amount} onChange={(e) => { setAmount(e.target.value); setPreview(null); }} />
            </label>
            <label>
              <span className="label">Tipo</span>
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="FINAL">Final (capital + rendimiento)</option>
                <option value="PROFIT">Rendimiento</option>
                <option value="PRINCIPAL">Devolución de capital</option>
              </select>
            </label>
            <label>
              <span className="label">Nota</span>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={cents <= 0}
              onClick={async () =>
                setPreview(await api(`/admin/distributions/preview?opportunityId=${o.id}&totalAmountCents=${cents}`))
              }
            >
              Calcular
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!preview || busy !== null}
              onClick={() =>
                run(
                  'dist',
                  async () => {
                    const d = await api<{ id: string }>('/admin/distributions', {
                      method: 'POST',
                      body: { opportunityId: o.id, kind, totalAmountCents: cents, note: note || undefined },
                    });
                    await api(`/admin/distributions/${d.id}/execute`, { method: 'POST' });
                    setAmount('');
                    setPreview(null);
                  },
                  'Reparto ejecutado',
                )
              }
            >
              {busy === 'dist' ? 'Ejecutando…' : 'Ejecutar reparto'}
            </button>
          </div>
          {preview && (
            <Alert tone="neutral">
              {num(preview.holders)} titulares · {num(preview.totalTokens)} tokens · {eur(Math.round(preview.perTokenCents))} por token
            </Alert>
          )}
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        </div>
      )}
      {o.distributions.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Tipo</th>
                <th scope="col">Importe</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {o.distributions.map((d) => (
                <tr key={d.id}>
                  <td>{date(d.executedAt ?? d.createdAt, true)}</td>
                  <td>{d.kind}</td>
                  <td>{eur(d.totalAmountCents)}</td>
                  <td>
                    <Badge tone={d.status === 'EXECUTED' ? 'green' : d.status === 'FAILED' ? 'red' : 'neutral'}>{d.status}</Badge>
                    {d.error && <div className="mt-1 text-xs text-danger-text">{d.error}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function AdminOpportunityPage() {
  const { id } = useParams<{ id: string }>();
  const { data: o, loading, reload } = useApi<AdminOpportunity>(`/admin/opportunities/${id}`);
  const [editing, setEditing] = useState(false);

  if (loading && !o) return <Spinner />;
  if (!o) return <Alert tone="red">Oportunidad no encontrada</Alert>;
  const s = OPPORTUNITY_STATUS[o.status];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={o.title}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={s.tone}>{s.label}</Badge>
            <Link href={`/admin/fincas/${o.farm.id}`}>{o.farm.name}</Link>
            {o.status !== 'DRAFT' && <Link href={`/oportunidades/${o.slug}`}>Ver ficha pública</Link>}
          </span>
        }
        back={{ href: '/admin/oportunidades', label: 'Oportunidades' }}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Captado" value={eur(o.stats.raisedCents)} sub={`de ${eur(o.targetAmountCents)}`} />
        <Stat label="Tokens vendidos" value={`${num(o.stats.tokensSold)} / ${num(o.totalTokens)}`} sub={`${num(o.stats.tokensReserved)} reservados`} />
        <Stat label="Inversores" value={num(o.stats.investorsCount)} />
        <Stat label="Cierre" value={date(o.closesAt)} />
      </div>
      <ProgressBar value={o.stats.progressPct} />

      <Lifecycle o={o} reload={reload} />

      <section className="card px-5 py-2">
        <h2 className="section-title pb-1 pt-3">Token</h2>
        <Row label="Nombre">{o.tokenName}</Row>
        <Row label="Símbolo">{o.tokenSymbol}</Row>
        <Row label="Contrato del token">
          <span className="font-mono text-sm">{shortAddress(o.tokenAddress)}</span>
        </Row>
        <Row label="Módulo de cumplimiento">
          <span className="font-mono text-sm">{shortAddress(o.complianceAddress)}</span>
        </Row>
        <Row label="Publicada" last>
          {date(o.publishedAt, true)}
        </Row>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Documentos</h2>
        {o.documents.length > 0 && (
          <ul className="card divide-y divide-line px-4">
            {o.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <button type="button" className="text-left font-medium underline-offset-2 hover:underline" onClick={() => openDocument(d.id)}>
                  {d.title}
                </button>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {DOCUMENT_TYPES[d.type]} · {d.visibility === 'PUBLIC' ? 'Público' : d.visibility === 'INVESTORS' ? 'Inversores' : 'Interno'}
                  {d.anchoredTxHash && <Badge tone="green">Anclado</Badge>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <DocumentUpload opportunityId={o.id} onDone={reload} />
      </section>

      <Investments o={o} reload={reload} />
      <Updates o={o} reload={reload} />
      <Distributions o={o} reload={reload} />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Datos de la oportunidad</h2>
          <button type="button" className="btn-secondary" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
            {editing ? 'Cerrar' : 'Editar'}
          </button>
        </div>
        {editing && (
          <OpportunityForm
            farms={[{ id: o.farm.id, name: o.farm.name }]}
            initial={o}
            opportunityId={o.id}
            locked={o.status !== 'DRAFT'}
            onSaved={async () => {
              setEditing(false);
              await reload();
            }}
          />
        )}
      </section>
    </div>
  );
}

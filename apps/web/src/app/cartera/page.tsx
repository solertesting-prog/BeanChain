'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import type { Investment, Portfolio } from '@/lib/types';
import { INVESTMENT_STATUS, OPPORTUNITY_STATUS, date, eur, num, shortAddress, stageLabel } from '@/lib/format';
import { Alert, Badge, CopyButton, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { StageTimeline } from '@/components/stage-timeline';
import { RequireAuth } from '@/components/require-auth';
import type { Me } from '@/lib/types';

function Dashboard({ user }: { user: Me }) {
  const { data: p, loading, error } = useApi<Portfolio>('/portfolio');
  const { data: investments, reload } = useApi<Investment[]>('/investments');
  const [selected, setSelected] = useState<string | null>(null);

  if (loading) return <Spinner />;
  if (error || !p) return <Alert tone="red" title="No hemos podido cargar tu cartera">{error?.message}</Alert>;

  const pending = (investments ?? []).filter((i) => i.status === 'PENDING_PAYMENT' && new Date(i.expiresAt) > new Date());
  const current = p.holdings.find((h) => h.opportunity.id === selected) ?? p.holdings.find((h) => h.tokens > 0) ?? p.holdings[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Hola, ${user.firstName}`} sub="Tu cartera de cosechas" />

      {user.kyc.status !== 'APPROVED' && (
        <Alert tone="amber" title="Verifica tu identidad para invertir">
          <Link href="/perfil/verificacion">Empezar la verificación</Link>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <section className="flex flex-col gap-4 rounded-[18px] bg-ink p-5 text-ground md:p-6" aria-label="Resumen de la cartera">
          <div>
            <div className="text-sm text-[#CDBBAA]">Valor estimado de tu cartera</div>
            <div className="font-display text-4xl leading-tight">{eur(p.totals.estimatedValueCents)}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <div className="text-xs text-[#CDBBAA]">Invertido</div>
              <div className="font-medium">{eur(p.totals.investedCents)}</div>
            </div>
            <div>
              <div className="text-xs text-[#CDBBAA]">Rendimientos cobrados</div>
              <div className="font-medium text-leaf-bright">{eur(p.totals.receivedCents)}</div>
            </div>
            {p.totals.pendingCents > 0 && (
              <div>
                <div className="text-xs text-[#CDBBAA]">Pendiente de pago</div>
                <div className="font-medium">{eur(p.totals.pendingCents)}</div>
              </div>
            )}
          </div>
          <p className="text-xs text-[#CDBBAA]">El valor estimado usa la rentabilidad prevista de cada cosecha; no está garantizado.</p>
        </section>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-[14px] bg-leaf-light px-4 py-4 text-leaf-dark">
            <div>
              <div className="text-xs">Próximo pago estimado</div>
              <div className="font-semibold">
                {p.nextPayout ? `${date(p.nextPayout.expectedAt)} · ${eur(p.nextPayout.estimatedCents)}` : 'Sin pagos previstos'}
              </div>
              {p.nextPayout && <div className="text-xs">{p.nextPayout.opportunityTitle}</div>}
            </div>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M16 3v4M8 3v4M3 11h18" />
            </svg>
          </div>
          <div className="card flex items-center justify-between gap-3 px-4 py-4">
            <div className="min-w-0">
              <div className="text-xs text-muted">Tu wallet</div>
              <div className="flex items-center gap-1 font-mono text-sm">
                {p.wallet ? shortAddress(p.wallet.address) : '—'}
                {p.wallet && <CopyButton value={p.wallet.address} label="Copiar" />}
              </div>
            </div>
            <Badge tone={p.wallet?.verified ? 'green' : 'neutral'}>{p.wallet?.verified ? 'Verificada' : 'Sin verificar'}</Badge>
          </div>
        </div>
      </div>

      {pending.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="pendientes">
          <h2 id="pendientes" className="section-title">
            Reservas pendientes de pago
          </h2>
          {pending.map((i) => (
            <div key={i.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="font-semibold">{i.opportunity?.title}</div>
                <div className="text-sm text-muted">
                  {num(i.tokens)} tokens · {eur(i.amountCents)} · concepto <span className="font-mono">{i.paymentReference}</span> · caduca el{' '}
                  {date(i.expiresAt, true)}
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost text-sm"
                onClick={async () => {
                  await api(`/investments/${i.id}/cancel`, { method: 'POST' });
                  await reload();
                }}
              >
                Cancelar reserva
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="tokens">
        <h2 id="tokens" className="section-title">
          Mis tokens
        </h2>
        {p.holdings.length === 0 ? (
          <EmptyState title="Todavía no tienes inversiones" action={<Link href="/oportunidades" className="btn-primary">Ver oportunidades</Link>}>
            Elige una cosecha y empieza con un solo token.
          </EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {p.holdings.map((h) => {
              const s = OPPORTUNITY_STATUS[h.opportunity.status];
              const isSel = current?.opportunity.id === h.opportunity.id;
              return (
                <button
                  key={h.opportunity.id}
                  type="button"
                  onClick={() => setSelected(h.opportunity.id)}
                  aria-pressed={isSel}
                  className={`card flex flex-col gap-1.5 p-4 text-left ${isSel ? 'ring-2 ring-leaf' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{h.opportunity.title}</span>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </div>
                  <div className="flex justify-between text-sm text-muted">
                    <span>
                      {num(h.tokens)} tokens · {h.opportunity.tokenSymbol}
                      {h.pendingTokens > 0 && ` · ${num(h.pendingTokens)} pendientes`}
                    </span>
                    <span>{eur(h.estimatedValueCents)}</span>
                  </div>
                  <div className="text-xs text-muted">
                    Invertido {eur(h.investedCents)} · cobrado {eur(h.receivedCents)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {current && (
        <section className="grid gap-4 md:grid-cols-2" aria-labelledby="estado">
          <div className="flex flex-col gap-3">
            <h2 id="estado" className="section-title">
              Estado de la cosecha · {current.opportunity.farm.name}
            </h2>
            <StageTimeline current={current.opportunity.latestUpdate?.stage ?? null} />
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="section-title">Última novedad</h2>
            {current.opportunity.latestUpdate ? (
              <div className="card p-4">
                <div className="text-xs text-muted">
                  {date(current.opportunity.latestUpdate.publishedAt)} · {stageLabel(current.opportunity.latestUpdate.stage)}
                </div>
                <div className="font-semibold">{current.opportunity.latestUpdate.title}</div>
                <Link href={`/oportunidades/${current.opportunity.slug}`} className="mt-2 inline-block text-sm">
                  Ver todas las novedades y documentos
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted">Aún no hay novedades de esta finca.</p>
            )}
            {current.opportunity.explorerUrl && (
              <a href={current.opportunity.explorerUrl} target="_blank" rel="noreferrer" className="text-sm">
                Ver el contrato del token en el explorador
              </a>
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="pagos">
        <h2 id="pagos" className="section-title">
          Pagos recibidos
        </h2>
        {p.payouts.length === 0 ? (
          <p className="text-sm text-muted">Los repartos aparecerán aquí cuando se venda la cosecha.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Cosecha</th>
                  <th scope="col">Tokens</th>
                  <th scope="col" className="text-right">
                    Importe
                  </th>
                  <th scope="col">
                    <span className="sr-only">Prueba</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.payouts.map((x) => (
                  <tr key={x.id}>
                    <td>{date(x.executedAt)}</td>
                    <td>{p.holdings.find((h) => h.opportunity.id === x.opportunityId)?.opportunity.title ?? '—'}</td>
                    <td>{num(x.tokens)}</td>
                    <td className="text-right font-medium">{eur(x.amountCents)}</td>
                    <td>{x.explorerUrl && <a href={x.explorerUrl} target="_blank" rel="noreferrer">Ver transacción</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(investments ?? []).length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="historial">
          <h2 id="historial" className="section-title">
            Historial de inversiones
          </h2>
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Cosecha</th>
                  <th scope="col">Tokens</th>
                  <th scope="col">Importe</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {investments!.map((i) => {
                  const st = INVESTMENT_STATUS[i.status];
                  return (
                    <tr key={i.id}>
                      <td>{date(i.createdAt)}</td>
                      <td>{i.opportunity?.title}</td>
                      <td>{num(i.tokens)}</td>
                      <td>{eur(i.amountCents)}</td>
                      <td>
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {i.mintExplorerUrl && (
                          <a href={i.mintExplorerUrl} target="_blank" rel="noreferrer" className="ml-2 text-xs">
                            Emisión
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  return <RequireAuth>{(user) => <Dashboard user={user} />}</RequireAuth>;
}

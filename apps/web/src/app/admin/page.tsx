'use client';

import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { OPPORTUNITY_STATUS, date, eur, num } from '@/lib/format';
import type { OpportunityStatus } from '@/lib/types';
import { Alert, Badge, PageHeader, Spinner, Stat } from '@/components/ui';

interface Stats {
  investors: number;
  kyc: { pending: number; approved: number };
  opportunities: Partial<Record<OpportunityStatus, number>>;
  raisedCents: number;
  pendingPayments: { count: number; amountCents: number };
  distributedCents: number;
  blockchainMode: 'live' | 'simulated';
  recentTransactions: { id: string; kind: string; txHash: string | null; status: string; createdAt: string; explorerUrl: string | null; error: string | null }[];
}

export default function AdminHome() {
  const { data, loading, error } = useApi<Stats>('/admin/stats');
  if (loading) return <Spinner />;
  if (error || !data) return <Alert tone="red">{error?.message}</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Resumen" sub={`Blockchain en modo ${data.blockchainMode === 'live' ? 'real' : 'simulado'}`} />
      {data.blockchainMode === 'simulated' && (
        <Alert tone="amber">
          Modo simulado: las transacciones no llegan a ninguna red. Configura BLOCKCHAIN_MODE=live y las direcciones de los contratos
          para operar en Polygon.
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Inversores" value={num(data.investors)} sub={`${num(data.kyc.approved)} con KYC aprobado`} />
        <Stat label="Captado" value={eur(data.raisedCents)} />
        <Stat label="Cobros pendientes" value={eur(data.pendingPayments.amountCents)} sub={`${num(data.pendingPayments.count)} reservas`} />
        <Stat label="Repartido" value={eur(data.distributedCents)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="section-title mb-3">Tareas</h2>
          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex justify-between">
              <Link href="/admin/kyc">Verificaciones por revisar</Link>
              <Badge tone={data.kyc.pending ? 'amber' : 'neutral'}>{num(data.kyc.pending)}</Badge>
            </li>
            <li className="flex justify-between">
              <Link href="/admin/inversiones">Transferencias por conciliar</Link>
              <Badge tone={data.pendingPayments.count ? 'amber' : 'neutral'}>{num(data.pendingPayments.count)}</Badge>
            </li>
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="section-title mb-3">Oportunidades</h2>
          <ul className="flex flex-wrap gap-2">
            {(Object.keys(OPPORTUNITY_STATUS) as OpportunityStatus[]).map((s) => (
              <li key={s}>
                <Badge tone={OPPORTUNITY_STATUS[s].tone}>
                  {OPPORTUNITY_STATUS[s].label}: {num(data.opportunities[s] ?? 0)}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card overflow-x-auto p-2">
        <h2 className="section-title px-3 pb-1 pt-3">Últimas transacciones</h2>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Operación</th>
              <th scope="col">Estado</th>
              <th scope="col">Hash</th>
            </tr>
          </thead>
          <tbody>
            {data.recentTransactions.map((t) => (
              <tr key={t.id}>
                <td>{date(t.createdAt, true)}</td>
                <td className="font-mono text-xs">{t.kind}</td>
                <td>
                  <Badge tone={t.status === 'FAILED' ? 'red' : t.status === 'CONFIRMED' ? 'green' : 'neutral'}>{t.status}</Badge>
                  {t.error && <div className="mt-1 max-w-xs text-xs text-danger-text">{t.error}</div>}
                </td>
                <td className="font-mono text-xs">
                  {t.txHash ? t.explorerUrl ? <a href={t.explorerUrl} target="_blank" rel="noreferrer">{t.txHash.slice(0, 12)}…</a> : `${t.txHash.slice(0, 12)}…` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

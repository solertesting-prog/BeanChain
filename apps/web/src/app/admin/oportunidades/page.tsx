'use client';

import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { OPPORTUNITY_STATUS, eurRound } from '@/lib/format';
import type { OpportunitySummary } from '@/lib/types';
import { Badge, EmptyState, PageHeader, ProgressBar, Spinner } from '@/components/ui';

export default function AdminOpportunitiesPage() {
  const { data, loading } = useApi<(OpportunitySummary & { tokenAddress: string | null })[]>('/admin/opportunities');
  return (
    <div>
      <PageHeader title="Oportunidades" actions={<Link href="/admin/oportunidades/nueva" className="btn-primary">Nueva oportunidad</Link>} />
      {loading ? (
        <Spinner />
      ) : !data?.length ? (
        <EmptyState title="Aún no hay oportunidades">Primero crea una finca y aprueba su revisión de sanciones.</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Oportunidad</th>
                <th scope="col">Estado</th>
                <th scope="col">Token</th>
                <th scope="col" className="min-w-[160px]">
                  Captación
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/admin/oportunidades/${o.id}`} className="font-medium">
                      {o.title}
                    </Link>
                    <div className="text-xs text-muted">{o.farm.name}</div>
                  </td>
                  <td>
                    <Badge tone={OPPORTUNITY_STATUS[o.status].tone}>{OPPORTUNITY_STATUS[o.status].label}</Badge>
                  </td>
                  <td className="font-mono text-xs">{o.tokenSymbol}</td>
                  <td>
                    <ProgressBar value={o.stats.progressPct} />
                    <div className="mt-1 text-xs text-muted">
                      {eurRound(o.stats.raisedCents)} / {eurRound(o.targetAmountCents)} · {o.stats.investorsCount} inv.
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

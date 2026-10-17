'use client';

import { useMemo, useState } from 'react';
import { useApi } from '@/lib/use-api';
import type { OpportunitySummary } from '@/lib/types';
import { OpportunityCard } from '@/components/opportunity-card';
import { Alert, EmptyState, PageHeader, Spinner } from '@/components/ui';

type Filter = 'open' | 'all' | 'CACAO' | 'COFFEE';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'En captación' },
  { key: 'all', label: 'Todas' },
  { key: 'CACAO', label: 'Cacao' },
  { key: 'COFFEE', label: 'Café' },
];

export default function OpportunitiesPage() {
  const { data, loading, error } = useApi<OpportunitySummary[]>('/opportunities');
  const [filter, setFilter] = useState<Filter>('open');

  const items = useMemo(() => {
    const all = data ?? [];
    if (filter === 'open') return all.filter((o) => o.status === 'PUBLISHED');
    if (filter === 'CACAO' || filter === 'COFFEE') return all.filter((o) => o.farm.crop === filter);
    return all;
  }, [data, filter]);

  return (
    <>
      <PageHeader title="Oportunidades" sub="Cosechas de fincas verificadas con comprador comprometido." />

      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filtrar oportunidades">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`min-h-[40px] rounded-full border px-4 text-sm ${
              filter === f.key ? 'border-ink bg-ink text-ground' : 'border-line bg-white text-ink hover:border-muted'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <Alert tone="red" title="No hemos podido cargar las oportunidades">{error.message}</Alert>}
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title={filter === 'open' ? 'No hay captaciones abiertas ahora mismo' : 'No hay oportunidades'}>
          Crea una cuenta y verifica tu identidad para recibir un aviso cuando publiquemos la próxima cosecha.
        </EmptyState>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((o) => (
            <OpportunityCard key={o.id} o={o} />
          ))}
        </div>
      )}
    </>
  );
}

'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useApi } from '@/lib/use-api';
import { EmptyState, PageHeader, Spinner } from '@/components/ui';
import { OpportunityForm } from '@/components/admin/opportunity-form';

function NewOpportunity() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: farms, loading } = useApi<{ id: string; name: string }[]>('/admin/farms');
  if (loading) return <Spinner />;
  if (!farms?.length) {
    return <EmptyState title="Primero crea una finca" action={<Link href="/admin/fincas/nueva" className="btn-primary">Nueva finca</Link>} />;
  }
  const farmId = params.get('farmId');
  return (
    <div>
      <PageHeader title="Nueva oportunidad" back={{ href: '/admin/oportunidades', label: 'Oportunidades' }} />
      <OpportunityForm
        farms={farms}
        initial={farmId ? { farmId } : undefined}
        onSaved={(id) => router.push(`/admin/oportunidades/${id}`)}
      />
    </div>
  );
}

export default function NewOpportunityPage() {
  return (
    <Suspense>
      <NewOpportunity />
    </Suspense>
  );
}

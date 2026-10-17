'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { FarmForm } from '@/components/admin/farm-form';

export default function NewFarmPage() {
  const router = useRouter();
  return (
    <div>
      <PageHeader title="Nueva finca" back={{ href: '/admin/fincas', label: 'Fincas' }} />
      <FarmForm onSaved={(id) => router.push(`/admin/fincas/${id}`)} />
    </div>
  );
}

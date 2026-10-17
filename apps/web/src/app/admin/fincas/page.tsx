'use client';

import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import { CROP, countryName, date } from '@/lib/format';
import { Badge, EmptyState, PageHeader, Spinner } from '@/components/ui';

interface FarmRow {
  id: string;
  name: string;
  crop: 'CACAO' | 'COFFEE';
  country: string;
  region: string;
  hectares: number;
  sanctionsClear: boolean;
  sanctionsCheckedAt: string | null;
  _count: { opportunities: number };
}

export default function AdminFarmsPage() {
  const { data, loading } = useApi<FarmRow[]>('/admin/farms');
  return (
    <div>
      <PageHeader title="Fincas" actions={<Link href="/admin/fincas/nueva" className="btn-primary">Nueva finca</Link>} />
      {loading ? (
        <Spinner />
      ) : !data?.length ? (
        <EmptyState title="Aún no hay fincas" action={<Link href="/admin/fincas/nueva" className="btn-primary">Crear la primera</Link>} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Finca</th>
                <th scope="col">Cultivo</th>
                <th scope="col">Ubicación</th>
                <th scope="col">Ha</th>
                <th scope="col">Sanciones</th>
                <th scope="col">Oport.</th>
              </tr>
            </thead>
            <tbody>
              {data.map((f) => (
                <tr key={f.id}>
                  <td>
                    <Link href={`/admin/fincas/${f.id}`} className="font-medium">
                      {f.name}
                    </Link>
                  </td>
                  <td>{CROP[f.crop]}</td>
                  <td>
                    {f.region}, {countryName(f.country)}
                  </td>
                  <td>{f.hectares}</td>
                  <td>
                    {f.sanctionsCheckedAt ? (
                      <Badge tone={f.sanctionsClear ? 'green' : 'red'}>{f.sanctionsClear ? `OK · ${date(f.sanctionsCheckedAt)}` : 'Bloqueada'}</Badge>
                    ) : (
                      <Badge tone="amber">Pendiente</Badge>
                    )}
                  </td>
                  <td>{f._count.opportunities}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useApi } from '@/lib/use-api';
import { date } from '@/lib/format';
import { PageHeader, Spinner } from '@/components/ui';

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  data: unknown;
  ip: string | null;
  createdAt: string;
  actor: { email: string } | null;
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const { data, loading } = useApi<{ items: AuditRow[]; total: number; pageSize: number }>(`/admin/audit?page=${page}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Auditoría" sub="Registro de acciones relevantes de usuarios y administradores." />
      {loading ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Quién</th>
                <th scope="col">Acción</th>
                <th scope="col">Entidad</th>
                <th scope="col">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">{date(a.createdAt, true)}</td>
                  <td>{a.actor?.email ?? 'sistema'}</td>
                  <td className="font-mono text-xs">{a.action}</td>
                  <td className="text-xs">
                    {a.entity}
                    {a.entityId && <div className="font-mono text-muted">{a.entityId}</div>}
                  </td>
                  <td className="max-w-xs break-all font-mono text-xs text-muted">{a.data ? JSON.stringify(a.data) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Anterior
        </button>
        <span className="text-sm text-muted">
          Página {page} de {pages}
        </span>
        <button type="button" className="btn-secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
          Siguiente
        </button>
      </div>
    </div>
  );
}

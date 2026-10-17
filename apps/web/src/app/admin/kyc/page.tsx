'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { KYC_STATUS, countryName, date } from '@/lib/format';
import type { KycStatus } from '@/lib/types';
import { Alert, Badge, EmptyState, PageHeader, Spinner } from '@/components/ui';

interface KycRow {
  id: string;
  status: KycStatus;
  provider: string;
  pepHit: boolean;
  sanctionsHit: boolean;
  rejectReason: string | null;
  createdAt: string;
  rawPayload: Record<string, unknown> | null;
  user: { id: string; email: string; firstName: string; lastName: string; country: string };
}

export default function AdminKycPage() {
  const [status, setStatus] = useState<KycStatus | ''>('PENDING');
  const { data, loading, reload } = useApi<KycRow[]>(`/admin/kyc${status ? `?status=${status}` : ''}`);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function review(id: string, approve: boolean) {
    setError(null);
    try {
      await api(`/admin/kyc/${id}/review`, { method: 'POST', body: { approve, reason: reasons[id] || undefined } });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Verificaciones KYC" />
      <div className="flex flex-wrap gap-2">
        {(['PENDING', 'APPROVED', 'REJECTED', ''] as const).map((s) => (
          <button
            key={s || 'all'}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={`min-h-[40px] rounded-full border px-4 text-sm ${status === s ? 'border-ink bg-ink text-ground' : 'border-line bg-white'}`}
          >
            {s ? KYC_STATUS[s].label : 'Todas'}
          </button>
        ))}
      </div>
      {error && <Alert tone="red">{error}</Alert>}
      {loading ? (
        <Spinner />
      ) : !data?.length ? (
        <EmptyState title="Nada por aquí" />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((k) => (
            <li key={k.id} className="card flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">
                    {k.user.firstName} {k.user.lastName}
                  </div>
                  <div className="text-sm text-muted">
                    {k.user.email} · {countryName(k.user.country)} · {k.provider} · {date(k.createdAt, true)}
                  </div>
                </div>
                <div className="flex gap-2">
                  {k.pepHit && <Badge tone="amber">PEP</Badge>}
                  {k.sanctionsHit && <Badge tone="red">Sanciones</Badge>}
                  <Badge tone={KYC_STATUS[k.status].tone}>{KYC_STATUS[k.status].label}</Badge>
                </div>
              </div>
              {k.rawPayload && k.provider === 'mock' && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                  {Object.entries(k.rawPayload).map(([key, v]) => (
                    <div key={key}>
                      <dt className="text-xs text-muted">{key}</dt>
                      <dd>{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {k.rejectReason && <p className="text-sm text-danger-text">Motivo: {k.rejectReason}</p>}
              {k.status === 'PENDING' && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-[220px] flex-1">
                    <span className="label">Motivo (obligatorio si rechazas)</span>
                    <input className="input" value={reasons[k.id] ?? ''} onChange={(e) => setReasons((r) => ({ ...r, [k.id]: e.target.value }))} />
                  </label>
                  <button type="button" className="btn-primary" onClick={() => review(k.id, true)}>
                    Aprobar
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => review(k.id, false)}>
                    Rechazar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

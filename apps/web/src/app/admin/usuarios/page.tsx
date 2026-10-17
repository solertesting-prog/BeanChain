'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { KYC_STATUS, countryName, date } from '@/lib/format';
import type { KycStatus, Role } from '@/lib/types';
import { Alert, Badge, PageHeader, Spinner } from '@/components/ui';

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  country: string;
  role: Role;
  status: 'ACTIVE' | 'SUSPENDED';
  investorCategory: 'RETAIL' | 'PROFESSIONAL';
  createdAt: string;
  kycStatus: KycStatus;
  _count: { investments: number };
}

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const { data, loading, reload } = useApi<{ items: UserRow[]; total: number }>(`/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = me?.role === 'ADMIN';

  async function update(id: string, body: Partial<Pick<UserRow, 'role' | 'status' | 'investorCategory'>>) {
    setError(null);
    try {
      await api(`/admin/users/${id}`, { method: 'PATCH', body });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Usuarios" sub={data ? `${data.total} en total` : undefined} />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <label htmlFor="q" className="sr-only">
          Buscar
        </label>
        <input id="q" className="input max-w-sm" placeholder="Nombre o correo" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="btn-secondary">
          Buscar
        </button>
      </form>
      {error && <Alert tone="red">{error}</Alert>}
      {loading ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Usuario</th>
                <th scope="col">País</th>
                <th scope="col">KYC</th>
                <th scope="col">Categoría</th>
                <th scope="col">Rol</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.firstName} {u.lastName}
                    <div className="text-xs text-muted">
                      {u.email} · alta {date(u.createdAt)} · {u._count.investments} inv.
                    </div>
                  </td>
                  <td>{countryName(u.country)}</td>
                  <td>
                    <Badge tone={KYC_STATUS[u.kycStatus].tone}>{KYC_STATUS[u.kycStatus].label}</Badge>
                  </td>
                  <td>
                    <select
                      aria-label="Categoría de inversor"
                      className="input min-h-[36px] py-1 text-sm"
                      value={u.investorCategory}
                      disabled={!isAdmin}
                      onChange={(e) => update(u.id, { investorCategory: e.target.value as UserRow['investorCategory'] })}
                    >
                      <option value="RETAIL">Minorista</option>
                      <option value="PROFESSIONAL">Profesional</option>
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label="Rol"
                      className="input min-h-[36px] py-1 text-sm"
                      value={u.role}
                      disabled={!isAdmin || u.id === me?.id}
                      onChange={(e) => update(u.id, { role: e.target.value as Role })}
                    >
                      <option value="INVESTOR">Inversor</option>
                      <option value="OPERATOR">Operador</option>
                      <option value="ADMIN">Administrador</option>
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-ghost min-h-[36px] text-sm"
                      disabled={!isAdmin || u.id === me?.id}
                      onClick={() => update(u.id, { status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}
                    >
                      {u.status === 'ACTIVE' ? 'Suspender' : 'Reactivar'}
                    </button>
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

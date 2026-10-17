'use client';

import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { date } from '@/lib/format';
import type { Notification } from '@/lib/types';
import { EmptyState, PageHeader, Spinner } from '@/components/ui';
import { RequireAuth } from '@/components/require-auth';

function Inbox() {
  const { data, loading, reload } = useApi<{ items: Notification[]; unread: number }>('/notifications');
  if (loading && !data) return <Spinner />;
  const items = data?.items ?? [];
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Notificaciones"
        actions={
          data && data.unread > 0 ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={async () => {
                await api('/notifications/read-all', { method: 'POST' });
                await reload();
              }}
            >
              Marcar todas como leídas
            </button>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <EmptyState title="No tienes notificaciones">Te avisaremos de cada etapa de tus cosechas y de cada pago.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => {
            const body = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className={n.readAt ? 'font-medium' : 'font-semibold'}>{n.title}</span>
                  <span className="flex-none text-xs text-muted">{date(n.createdAt, true)}</span>
                </div>
                <p className="mt-0.5 text-sm text-muted">{n.body}</p>
              </>
            );
            const cls = `card block p-4 text-ink no-underline hover:text-ink ${n.readAt ? '' : 'border-l-0 ring-1 ring-leaf/40'}`;
            const markRead = () => {
              if (!n.readAt) void api(`/notifications/${n.id}/read`, { method: 'POST' });
            };
            return (
              <li key={n.id}>
                {n.link ? (
                  <Link href={n.link} className={cls} onClick={markRead}>
                    {!n.readAt && <span className="sr-only">Sin leer: </span>}
                    {body}
                  </Link>
                ) : (
                  <button type="button" className={`${cls} w-full text-left`} onClick={async () => { markRead(); await reload(); }}>
                    {!n.readAt && <span className="sr-only">Sin leer: </span>}
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  return <RequireAuth>{() => <Inbox />}</RequireAuth>;
}

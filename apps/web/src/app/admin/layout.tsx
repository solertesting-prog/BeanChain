'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RequireAuth } from '@/components/require-auth';

const NAV = [
  { href: '/admin', label: 'Resumen' },
  { href: '/admin/kyc', label: 'Verificaciones KYC' },
  { href: '/admin/fincas', label: 'Fincas' },
  { href: '/admin/oportunidades', label: 'Oportunidades' },
  { href: '/admin/inversiones', label: 'Inversiones y cobros' },
  { href: '/admin/usuarios', label: 'Usuarios' },
  { href: '/admin/auditoria', label: 'Auditoría' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <RequireAuth staff>
      {() => (
        <div className="flex flex-wrap gap-6">
          <nav aria-label="Backoffice" className="w-full md:w-56 md:flex-none">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Backoffice</div>
            <ul className="flex gap-1 overflow-x-auto pb-2 md:flex-col md:overflow-visible">
              {NAV.map((n) => {
                const active = n.href === '/admin' ? path === '/admin' : path.startsWith(n.href);
                return (
                  <li key={n.href} className="flex-none">
                    <Link
                      href={n.href}
                      aria-current={active ? 'page' : undefined}
                      className={`block whitespace-nowrap rounded-lg px-3 py-2 text-[15px] no-underline ${
                        active ? 'bg-white font-semibold text-ink' : 'text-muted hover:text-ink'
                      }`}
                    >
                      {n.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="min-w-0 flex-[999_1_560px]">{children}</div>
        </div>
      )}
    </RequireAuth>
  );
}

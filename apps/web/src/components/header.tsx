'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isStaff, useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = path === href || (href !== '/' && path.startsWith(href));
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-lg px-3 py-2 text-[15px] no-underline ${active ? 'bg-white font-semibold text-ink' : 'text-muted hover:text-ink'}`}
    >
      {children}
    </Link>
  );
}

export function Header() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = () =>
      api<{ unread: number }>('/notifications?unread=true')
        .then((r) => alive && setUnread(r.unread))
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user, path]);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ground/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-ink no-underline">
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
            <ellipse cx="16" cy="16" rx="9" ry="13" fill="#5B3A26" />
            <path d="M16 4c-3 6-3 18 0 24" stroke="#F1E6DA" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
          <span className="font-display text-xl">BeanChain</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
          <NavLink href="/oportunidades">Oportunidades</NavLink>
          {user && <NavLink href="/cartera">Cartera</NavLink>}
          <NavLink href="/como-funciona">Cómo funciona</NavLink>
          <NavLink href="/verificar">Verificar documento</NavLink>
          {isStaff(user) && <NavLink href="/admin">Backoffice</NavLink>}
        </nav>

        <div className="flex items-center gap-1">
          {!loading && !user && (
            <>
              <Link href="/entrar" className="btn-ghost hidden sm:inline-flex">
                Entrar
              </Link>
              <Link href="/registro" className="btn-primary">
                Crear cuenta
              </Link>
            </>
          )}
          {user && (
            <>
              <Link
                href="/notificaciones"
                aria-label={unread ? `Notificaciones (${unread} sin leer)` : 'Notificaciones'}
                className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
                  <path d="M10 20a2 2 0 0 0 4 0" />
                </svg>
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-leaf px-1 text-center text-[11px] font-semibold leading-[18px] text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Link>
              <Link href="/perfil" className="btn-ghost hidden sm:inline-flex">
                {user.firstName}
              </Link>
              <button
                type="button"
                className="btn-ghost hidden md:inline-flex"
                onClick={async () => {
                  await logout();
                  router.push('/');
                }}
              >
                Salir
              </button>
            </>
          )}
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-lg md:hidden"
            aria-label="Menú"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-line px-4 pb-4 pt-2 md:hidden" aria-label="Menú móvil">
          <div className="flex flex-col gap-1">
            <NavLink href="/oportunidades">Oportunidades</NavLink>
            {user && <NavLink href="/cartera">Cartera</NavLink>}
            <NavLink href="/como-funciona">Cómo funciona</NavLink>
            <NavLink href="/verificar">Verificar documento</NavLink>
            {isStaff(user) && <NavLink href="/admin">Backoffice</NavLink>}
            {user ? (
              <>
                <NavLink href="/perfil">Mi perfil</NavLink>
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-left text-[15px] text-muted"
                  onClick={async () => {
                    await logout();
                    router.push('/');
                  }}
                >
                  Salir
                </button>
              </>
            ) : (
              <NavLink href="/entrar">Entrar</NavLink>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-muted md:grid-cols-3">
        <div>
          <div className="font-display text-lg text-ink">BeanChain</div>
          <p className="mt-1">Prefinanciación de cosechas de cacao y café con tokens regulados.</p>
        </div>
        <div className="flex flex-col gap-1">
          <Link href="/como-funciona">Cómo funciona</Link>
          <Link href="/riesgos">Riesgos de la inversión</Link>
          <Link href="/verificar">Verificar un documento</Link>
        </div>
        <p className="text-xs leading-relaxed">
          Invertir en cosechas conlleva riesgos, incluida la pérdida total del capital, y la liquidez es limitada. La
          rentabilidad no está garantizada y las rentabilidades pasadas no anticipan las futuras. [NOMBRE LEGAL DEL
          EMISOR] · [Nº DE REGISTRO / AUTORIZACIÓN].
        </p>
      </div>
    </footer>
  );
}

'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { isStaff, useAuth } from '@/lib/auth';
import { Spinner } from './ui';
import type { Me } from '@/lib/types';

export function RequireAuth({ children, staff = false }: { children: (user: Me) => React.ReactNode; staff?: boolean }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/entrar?siguiente=${encodeURIComponent(path)}`);
    else if (staff && !isStaff(user)) router.replace('/');
  }, [loading, user, staff, router, path]);

  if (loading || !user || (staff && !isStaff(user))) return <Spinner />;
  return <>{children(user)}</>;
}

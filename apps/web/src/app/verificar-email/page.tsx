'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Spinner } from '@/components/ui';

function Verify() {
  const params = useSearchParams();
  const { refresh } = useAuth();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setState('error');
      setMessage('Falta el código de verificación en el enlace.');
      return;
    }
    api('/auth/verify-email', { method: 'POST', body: { token } })
      .then(async () => {
        setState('ok');
        await refresh();
      })
      .catch((e) => {
        setState('error');
        setMessage(e instanceof ApiError ? e.message : 'No se ha podido verificar el correo');
      });
  }, [params, refresh]);

  return (
    <div className="mx-auto max-w-md">
      {state === 'loading' && <Spinner label="Verificando tu correo…" />}
      {state === 'ok' && (
        <Alert tone="green" title="Correo confirmado">
          Ya puedes <Link href="/perfil/verificacion">verificar tu identidad</Link> para invertir.
        </Alert>
      )}
      {state === 'error' && <Alert tone="red" title="No se ha podido confirmar">{message}</Alert>}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}

'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Alert, Field } from '@/components/ui';

function safeNext(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/cartera';
}

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [needMfa, setNeedMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await login(email, password, needMfa ? mfaCode : undefined);
      if (res.mfaRequired) {
        setNeedMfa(true);
        return;
      }
      router.push(safeNext(params.get('siguiente')));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido iniciar sesión');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl">Entrar</h1>
      <p className="mt-1 text-muted">
        ¿No tienes cuenta? <Link href={`/registro${params.get('siguiente') ? `?siguiente=${encodeURIComponent(params.get('siguiente')!)}` : ''}`}>Crea una</Link>
      </p>
      <form onSubmit={submit} className="card mt-6 flex flex-col gap-4 p-5">
        {!needMfa ? (
          <>
            <Field label="Correo electrónico" htmlFor="email">
              <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Contraseña" htmlFor="password">
              <input id="password" type="password" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </>
        ) : (
          <Field label="Código de verificación" htmlFor="mfa" hint="Abre tu app de autenticación e introduce el código de 6 dígitos.">
            <input
              id="mfa"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              className="input text-center text-lg tracking-[0.3em]"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
        )}
        {error && <Alert tone="red">{error}</Alert>}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Entrando…' : needMfa ? 'Verificar' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

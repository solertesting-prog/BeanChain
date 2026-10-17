'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { SIGNUP_COUNTRIES, countryName } from '@/lib/format';
import { Alert, Field } from '@/components/ui';

function RegisterForm() {
  const { register } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', country: 'ES' });
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const pwOk = form.password.length >= 10 && /[a-z]/.test(form.password) && /[A-Z]/.test(form.password) && /\d/.test(form.password);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pwOk) return setError('La contraseña debe tener al menos 10 caracteres, con mayúsculas, minúsculas y números.');
    if (!accept) return setError('Debes aceptar los términos y la política de privacidad.');
    setBusy(true);
    try {
      await register({ ...form, acceptTerms: true });
      const next = params.get('siguiente');
      router.push(next && next.startsWith('/') && !next.startsWith('//') ? '/perfil/verificacion?siguiente=' + encodeURIComponent(next) : '/perfil/verificacion');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido crear la cuenta');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl">Crea tu cuenta</h1>
      <p className="mt-1 text-muted">
        ¿Ya tienes cuenta? <Link href="/entrar">Entra</Link>
      </p>
      <form onSubmit={submit} className="card mt-6 flex flex-col gap-4 p-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="firstName">
            <input id="firstName" autoComplete="given-name" required className="input" value={form.firstName} onChange={set('firstName')} />
          </Field>
          <Field label="Apellidos" htmlFor="lastName">
            <input id="lastName" autoComplete="family-name" required className="input" value={form.lastName} onChange={set('lastName')} />
          </Field>
        </div>
        <Field label="Correo electrónico" htmlFor="email">
          <input id="email" type="email" autoComplete="email" required className="input" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Contraseña" htmlFor="password" hint="Mínimo 10 caracteres, con mayúsculas, minúsculas y números.">
          <input id="password" type="password" autoComplete="new-password" required className="input" value={form.password} onChange={set('password')} />
        </Field>
        <Field label="País de residencia" htmlFor="country" hint="Determina qué oportunidades puedes ver y la normativa que te aplica.">
          <select id="country" className="input" value={form.country} onChange={set('country')}>
            {SIGNUP_COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {countryName(c)}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-[#2E6A4B]" />
          <span>
            Acepto los <Link href="/terminos">términos de uso</Link> y la <Link href="/privacidad">política de privacidad</Link>.
          </span>
        </label>
        {error && <Alert tone="red">{error}</Alert>}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

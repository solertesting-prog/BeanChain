'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { KYC_STATUS, SIGNUP_COUNTRIES, countryName, date } from '@/lib/format';
import { Alert, Badge, Field, PageHeader } from '@/components/ui';
import { RequireAuth } from '@/components/require-auth';
import type { Me } from '@/lib/types';

interface StartResult {
  status: 'APPROVED' | 'STARTED';
  provider?: string;
  mode?: 'mock' | 'sdk' | 'redirect';
  accessToken?: string;
  url?: string;
}

declare global {
  interface Window {
    snsWebSdk?: any;
  }
}

function SumsubWidget({ token, onDone }: { token: string; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const launch = () => {
      const sdk = window.snsWebSdk
        .init(token, () => api<StartResult>('/kyc/start', { method: 'POST' }).then((r) => r.accessToken))
        .withConf({ lang: 'es' })
        .on('idCheck.onApplicantStatusChanged', onDone)
        .build();
      sdk.launch('#sumsub-websdk');
    };
    if (window.snsWebSdk) return launch();
    const s = document.createElement('script');
    s.src = 'https://static.sumsub.com/idensic/static/sns-websdk-builder.js';
    s.async = true;
    s.onload = launch;
    document.body.appendChild(s);
  }, [token, onDone]);
  return <div id="sumsub-websdk" ref={ref} className="min-h-[480px]" />;
}

function MockForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [nationality, setNationality] = useState('ES');
  const [dateOfBirth, setDob] = useState('');
  const [sourceOfFunds, setSource] = useState('');
  const [isPep, setPep] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!dateOfBirth || !sourceOfFunds.trim()) return setError('Completa todos los campos.');
    setBusy(true);
    try {
      await api('/kyc/mock/submit', { method: 'POST', body: { nationality, dateOfBirth, sourceOfFunds, isPep } });
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido enviar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-4 p-5" noValidate>
      <Alert tone="amber">
        Entorno de pruebas: este formulario sustituye al proveedor de verificación real. Un administrador revisará tu solicitud.
      </Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nacionalidad" htmlFor="nat">
          <select id="nat" className="input" value={nationality} onChange={(e) => setNationality(e.target.value)}>
            {SIGNUP_COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {countryName(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha de nacimiento" htmlFor="dob">
          <input id="dob" type="date" className="input" value={dateOfBirth} onChange={(e) => setDob(e.target.value)} />
        </Field>
      </div>
      <Field label="Origen de los fondos" htmlFor="sof" hint="Por ejemplo: ahorros del trabajo, venta de un inmueble, herencia.">
        <input id="sof" className="input" value={sourceOfFunds} onChange={(e) => setSource(e.target.value)} />
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={isPep} onChange={(e) => setPep(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-[#2E6A4B]" />
        <span>Soy, o tengo relación cercana con, una persona con responsabilidad pública (PEP).</span>
      </label>
      {error && <Alert tone="red">{error}</Alert>}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Enviando…' : 'Enviar para revisión'}
      </button>
    </form>
  );
}

function Verification({ user }: { user: Me }) {
  const { refresh } = useAuth();
  const params = useSearchParams();
  const [session, setSession] = useState<StartResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = user.kyc.status;
  const s = KYC_STATUS[status];
  const next = params.get('siguiente');

  async function start() {
    setError(null);
    try {
      const r = await api<StartResult>('/kyc/start', { method: 'POST' });
      if (r.status === 'APPROVED') return refresh();
      if (r.mode === 'redirect' && r.url) {
        window.location.href = r.url;
        return;
      }
      setSession(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido iniciar la verificación');
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Verificación de identidad"
        sub="Por normativa contra el blanqueo de capitales, verificamos la identidad de cada inversor antes de emitirle tokens."
        back={{ href: '/perfil', label: 'Mi perfil' }}
      />

      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="text-sm text-muted">Estado</div>
          <div className="mt-1">
            <Badge tone={s.tone}>{s.label}</Badge>
          </div>
        </div>
        {status === 'APPROVED' && <div className="text-sm text-muted">Válida hasta el {date(user.kyc.expiresAt)}</div>}
      </div>

      {status === 'APPROVED' && (
        <Alert tone="green" title="Identidad verificada">
          Tu wallet está registrada en el contrato de identidades y ya puedes recibir tokens.{' '}
          <Link href={next && next.startsWith('/') ? next : '/oportunidades'}>Continuar</Link>
        </Alert>
      )}

      {status === 'PENDING' && !session && (
        <Alert tone="amber" title="Estamos revisando tu documentación">
          Te avisaremos en cuanto termine la revisión. Suele tardar menos de 24 horas laborables.
        </Alert>
      )}

      {status === 'REJECTED' && (
        <Alert tone="red" title="No hemos podido verificar tu identidad">
          {user.kyc.rejectReason ?? 'Revisa tus datos e inténtalo de nuevo.'}
        </Alert>
      )}

      {!user.emailVerifiedAt && (
        <Alert tone="amber">Confirma tu correo con el enlace que te hemos enviado. Lo necesitarás para invertir.</Alert>
      )}

      {status !== 'APPROVED' && status !== 'PENDING' && !session && (
        <div className="card flex flex-col gap-3 p-5">
          <h2 className="section-title">Qué necesitas</h2>
          <ul className="list-disc pl-5 text-sm text-muted">
            <li>Tu documento de identidad o pasaporte en vigor.</li>
            <li>Un selfie o vídeo corto para comprobar que eres tú.</li>
            <li>Unos 5 minutos.</li>
          </ul>
          <button type="button" className="btn-primary w-fit" onClick={start}>
            Empezar la verificación
          </button>
        </div>
      )}

      {session?.mode === 'mock' && (
        <MockForm
          onSubmitted={async () => {
            setSession(null);
            await refresh();
          }}
        />
      )}
      {session?.mode === 'sdk' && session.accessToken && (
        <div className="card p-2">
          <SumsubWidget token={session.accessToken} onDone={() => void refresh()} />
        </div>
      )}
      {error && <Alert tone="red">{error}</Alert>}
    </div>
  );
}

export default function VerificationPage() {
  return (
    <RequireAuth>
      {(user) => (
        <Suspense>
          <Verification user={user} />
        </Suspense>
      )}
    </RequireAuth>
  );
}

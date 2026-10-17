'use client';

import Link from 'next/link';
import QRCode from 'qrcode';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { KYC_STATUS, countryName, shortAddress } from '@/lib/format';
import { Alert, Badge, CopyButton, Field, PageHeader, Row } from '@/components/ui';
import { RequireAuth } from '@/components/require-auth';
import type { Me } from '@/lib/types';

function Mfa({ user }: { user: Me }) {
  const { refresh } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  async function begin() {
    setMsg(null);
    try {
      const r = await api<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup', { method: 'POST' });
      setSetup({ secret: r.secret, qr: await QRCode.toDataURL(r.otpauthUrl, { margin: 1, width: 200 }) });
    } catch (err) {
      setMsg({ tone: 'red', text: err instanceof ApiError ? err.message : 'Error' });
    }
  }

  async function confirm(path: 'enable' | 'disable') {
    setMsg(null);
    try {
      await api(`/auth/mfa/${path}`, { method: 'POST', body: { code } });
      setSetup(null);
      setCode('');
      await refresh();
      setMsg({ tone: 'green', text: path === 'enable' ? 'Verificación en dos pasos activada' : 'Verificación en dos pasos desactivada' });
    } catch (err) {
      setMsg({ tone: 'red', text: err instanceof ApiError ? err.message : 'Código incorrecto' });
    }
  }

  return (
    <section className="card flex flex-col gap-3 p-5" aria-labelledby="mfa">
      <div className="flex items-center justify-between gap-3">
        <h2 id="mfa" className="section-title">
          Verificación en dos pasos
        </h2>
        <Badge tone={user.mfaEnabled ? 'green' : 'neutral'}>{user.mfaEnabled ? 'Activada' : 'Desactivada'}</Badge>
      </div>
      <p className="text-sm text-muted">Protege tu cuenta con un código de una app como Google Authenticator, 1Password o Authy.</p>

      {!user.mfaEnabled && !setup && (
        <button type="button" className="btn-secondary w-fit" onClick={begin}>
          Activar
        </button>
      )}
      {setup && (
        <div className="flex flex-col gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="Código QR para tu app de autenticación" width={200} height={200} className="rounded-lg" />
          <div className="text-sm text-muted">
            O introduce esta clave: <span className="font-mono text-ink">{setup.secret}</span>
          </div>
        </div>
      )}
      {(setup || user.mfaEnabled) && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Código de 6 dígitos" htmlFor="mfa-code">
            <input
              id="mfa-code"
              inputMode="numeric"
              maxLength={6}
              className="input w-40 text-center tracking-[0.3em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <button type="button" className={user.mfaEnabled ? 'btn-secondary' : 'btn-primary'} disabled={code.length !== 6} onClick={() => confirm(user.mfaEnabled ? 'disable' : 'enable')}>
            {user.mfaEnabled ? 'Desactivar' : 'Confirmar'}
          </button>
        </div>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </section>
  );
}

function PasswordForm() {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  return (
    <form
      className="card flex flex-col gap-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        try {
          await api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
          setCurrent('');
          setNew('');
          setMsg({ tone: 'green', text: 'Contraseña cambiada. Se han cerrado tus otras sesiones.' });
        } catch (err) {
          setMsg({ tone: 'red', text: err instanceof ApiError ? err.message : 'Error' });
        }
      }}
    >
      <h2 className="section-title">Contraseña</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Contraseña actual" htmlFor="pw-cur">
          <input id="pw-cur" type="password" autoComplete="current-password" className="input" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="Nueva contraseña" htmlFor="pw-new" hint="Mínimo 10 caracteres, con mayúsculas, minúsculas y números.">
          <input id="pw-new" type="password" autoComplete="new-password" className="input" value={newPassword} onChange={(e) => setNew(e.target.value)} />
        </Field>
      </div>
      <button type="submit" className="btn-secondary w-fit" disabled={!currentPassword || !newPassword}>
        Cambiar contraseña
      </button>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </form>
  );
}

function Profile({ user }: { user: Me }) {
  const kyc = KYC_STATUS[user.kyc.status];
  const [resent, setResent] = useState(false);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title="Mi perfil" />

      {!user.emailVerifiedAt && (
        <Alert tone="amber" title="Confirma tu correo">
          Te enviamos un enlace a {user.email}.{' '}
          <button
            type="button"
            className="font-semibold underline"
            disabled={resent}
            onClick={() => api('/auth/resend-verification', { method: 'POST' }).then(() => setResent(true))}
          >
            {resent ? 'Enviado' : 'Reenviar'}
          </button>
        </Alert>
      )}

      <section className="card px-5 py-2">
        <Row label="Nombre">
          {user.firstName} {user.lastName}
        </Row>
        <Row label="Correo">{user.email}</Row>
        <Row label="País de residencia">{countryName(user.country)}</Row>
        <Row label="Categoría">{user.investorCategory === 'PROFESSIONAL' ? 'Profesional' : 'Minorista'}</Row>
        <Row label="Identidad" last>
          <span className="inline-flex items-center gap-2">
            <Badge tone={kyc.tone}>{kyc.label}</Badge>
            {user.kyc.status !== 'APPROVED' && <Link href="/perfil/verificacion">Verificar</Link>}
          </span>
        </Row>
      </section>

      <section className="card flex flex-col gap-2 p-5" aria-labelledby="wallet">
        <h2 id="wallet" className="section-title">
          Tu wallet
        </h2>
        {user.wallet ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm">{shortAddress(user.wallet.address)}</span>
              <span className="flex items-center gap-2">
                <Badge tone={user.wallet.onchainRegisteredAt ? 'green' : 'amber'}>
                  {user.wallet.onchainRegisteredAt ? 'Verificada on-chain' : 'Pendiente de registro'}
                </Badge>
                <CopyButton value={user.wallet.address} />
              </span>
            </div>
            <p className="text-sm text-muted">
              {user.wallet.custodial
                ? 'Wallet custodiada por la plataforma: no necesitas gestionar claves. Tus tokens y pagos llegan aquí.'
                : 'Wallet propia vinculada a tu cuenta.'}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Crearemos tu wallet automáticamente cuando verifiques tu identidad.</p>
        )}
      </section>

      <Mfa user={user} />
      <PasswordForm />
    </div>
  );
}

export default function ProfilePage() {
  return <RequireAuth>{(user) => <Profile user={user} />}</RequireAuth>;
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { DOCUMENT_TYPES, date } from '@/lib/format';
import type { DocumentType } from '@/lib/types';
import { Alert, PageHeader } from '@/components/ui';

interface VerifyResult {
  found: boolean;
  sha256: string;
  title?: string;
  type?: DocumentType;
  opportunity?: { title: string; slug: string } | null;
  uploadedAt?: string;
  anchoredAt?: string | null;
  anchoredTxHash?: string | null;
  explorerUrl?: string | null;
}

async function sha256(file: File): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function VerifyPage() {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  async function check(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const hash = await sha256(file);
      setResult(await api<VerifyResult>(`/documents/verify/${hash}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido comprobar el fichero');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Verificar un documento"
        sub="Comprueba que un informe, factura o contrato es exactamente el que publicamos y registramos en la blockchain."
      />
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void check(e.dataTransfer.files?.[0]);
        }}
        className={`card flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed p-10 text-center ${drag ? 'border-leaf' : 'border-line'}`}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#6B5A4E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 14l2 2 4-4" />
        </svg>
        <span className="font-medium">{busy ? 'Calculando huella…' : 'Arrastra aquí el fichero o pulsa para elegirlo'}</span>
        <span className="text-sm text-muted">El fichero no sale de tu dispositivo: sólo enviamos su huella SHA-256.</span>
        <input type="file" className="sr-only" onChange={(e) => void check(e.target.files?.[0])} />
      </label>

      {error && <Alert tone="red">{error}</Alert>}
      {result && !result.found && (
        <Alert tone="red" title="No coincide con ningún documento registrado">
          El fichero puede haber sido modificado, o no lo hemos publicado nosotros. Huella: <span className="break-all font-mono text-xs">{result.sha256}</span>
        </Alert>
      )}
      {result?.found && (
        <Alert tone="green" title="Documento auténtico">
          <div className="mt-1 flex flex-col gap-1">
            <span>
              {result.title} · {result.type ? DOCUMENT_TYPES[result.type] : ''}
            </span>
            {result.opportunity && (
              <span>
                Oportunidad: <Link href={`/oportunidades/${result.opportunity.slug}`}>{result.opportunity.title}</Link>
              </span>
            )}
            <span>Publicado el {date(result.uploadedAt)}</span>
            {result.anchoredAt && (
              <span>
                Registrado en la blockchain el {date(result.anchoredAt, true)}
                {result.explorerUrl && (
                  <>
                    {' · '}
                    <a href={result.explorerUrl} target="_blank" rel="noreferrer">
                      ver transacción
                    </a>
                  </>
                )}
              </span>
            )}
          </div>
        </Alert>
      )}
    </div>
  );
}

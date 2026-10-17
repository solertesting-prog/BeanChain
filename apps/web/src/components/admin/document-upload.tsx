'use client';

import { useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { DOCUMENT_TYPES } from '@/lib/format';
import type { DocumentType } from '@/lib/types';
import { Alert } from '@/components/ui';

export function DocumentUpload({
  opportunityId,
  farmId,
  harvestUpdateId,
  defaultType = 'CONTRACT',
  onDone,
}: {
  opportunityId?: string;
  farmId?: string;
  harvestUpdateId?: string;
  defaultType?: DocumentType;
  onDone: () => void;
}) {
  const [type, setType] = useState<DocumentType>(defaultType);
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'INVESTORS' | 'ADMIN'>('INVESTORS');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const id = opportunityId ?? farmId ?? harvestUpdateId ?? 'doc';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return setMsg({ tone: 'red', text: 'Elige un fichero' });
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    form.append('title', title || DOCUMENT_TYPES[type]);
    form.append('visibility', visibility);
    if (opportunityId) form.append('opportunityId', opportunityId);
    if (farmId) form.append('farmId', farmId);
    if (harvestUpdateId) form.append('harvestUpdateId', harvestUpdateId);
    setBusy(true);
    try {
      await api('/admin/documents', { method: 'POST', form });
      setTitle('');
      if (fileRef.current) fileRef.current.value = '';
      setMsg({ tone: 'green', text: 'Documento subido y registrado en la blockchain' });
      onDone();
    } catch (err) {
      setMsg({ tone: 'red', text: err instanceof ApiError ? err.message : 'Error al subir' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="label">Tipo</span>
          <select id={`${id}-type`} className="input" value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
            {(Object.keys(DOCUMENT_TYPES) as DocumentType[]).map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPES[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Título</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={DOCUMENT_TYPES[type]} />
        </label>
        <label>
          <span className="label">Visible para</span>
          <select className="input" value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
            <option value="PUBLIC">Todo el mundo</option>
            <option value="INVESTORS">Inversores verificados</option>
            <option value="ADMIN">Sólo backoffice</option>
          </select>
        </label>
      </div>
      <label>
        <span className="label">Fichero (PDF, imagen, CSV, XLSX o DOCX · máx. 25 MB)</span>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xlsx,.docx" className="block w-full text-sm" />
      </label>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <button type="submit" className="btn-secondary w-fit" disabled={busy}>
        {busy ? 'Subiendo…' : 'Subir documento'}
      </button>
    </form>
  );
}

'use client';

import { useState } from 'react';
import { openDocument } from '@/lib/api';
import { DOCUMENT_TYPES, date } from '@/lib/format';
import type { DocumentInfo } from '@/lib/types';

export function DocumentList({ documents }: { documents: DocumentInfo[] }) {
  const [error, setError] = useState<string | null>(null);
  if (documents.length === 0) return <p className="text-sm text-muted">Todavía no hay documentos publicados.</p>;
  return (
    <div>
      <ul className="divide-y divide-line">
        {documents.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="min-w-0">
              <button
                type="button"
                className="text-left font-medium text-ink underline-offset-2 hover:underline"
                onClick={() => openDocument(d.id).catch((e) => setError(e.message))}
              >
                {d.title}
              </button>
              <div className="text-xs text-muted">
                {DOCUMENT_TYPES[d.type]} · {Math.max(1, Math.round(d.sizeBytes / 1024))} KB
              </div>
            </div>
            {d.anchoredTxHash ? (
              <span className="flex items-center gap-1 text-xs text-leaf-dark">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {d.explorerUrl ? (
                  <a href={d.explorerUrl} target="_blank" rel="noreferrer">
                    Registrado el {date(d.anchoredAt)}
                  </a>
                ) : (
                  <span>Registrado el {date(d.anchoredAt)}</span>
                )}
              </span>
            ) : (
              <span className="text-xs text-muted">Sin registrar</span>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-danger-text">{error}</p>}
    </div>
  );
}

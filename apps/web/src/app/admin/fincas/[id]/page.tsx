'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError, openDocument } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { DOCUMENT_TYPES, OPPORTUNITY_STATUS, date } from '@/lib/format';
import type { DocumentType, OpportunityStatus } from '@/lib/types';
import { Alert, Badge, PageHeader, Spinner } from '@/components/ui';
import { FarmForm, FarmInput } from '@/components/admin/farm-form';
import { DocumentUpload } from '@/components/admin/document-upload';

interface FarmDetail extends FarmInput {
  id: string;
  slug: string;
  sanctionsClear: boolean;
  sanctionsNote: string | null;
  sanctionsCheckedAt: string | null;
  opportunities: { id: string; slug: string; title: string; status: OpportunityStatus; harvestYear: number }[];
  documents: { id: string; title: string; type: DocumentType; createdAt: string; anchoredTxHash: string | null }[];
}

function pickInput(f: FarmDetail): FarmInput {
  return {
    name: f.name,
    crop: f.crop,
    varieties: f.varieties,
    country: f.country,
    region: f.region,
    municipality: f.municipality,
    hectares: f.hectares,
    altitudeM: f.altitudeM,
    latitude: f.latitude,
    longitude: f.longitude,
    description: f.description,
    ownerName: f.ownerName,
    ownerType: f.ownerType,
    productionHistory: f.productionHistory,
  };
}

function SanctionsCheck({ farm, onDone }: { farm: FarmDetail; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function save(clear: boolean) {
    setError(null);
    try {
      await api(`/admin/farms/${farm.id}/sanctions-check`, { method: 'POST', body: { clear, note } });
      setNote('');
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error');
    }
  }
  return (
    <section className="card flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-title">Revisión de sanciones</h2>
        {farm.sanctionsCheckedAt ? (
          <Badge tone={farm.sanctionsClear ? 'green' : 'red'}>{farm.sanctionsClear ? 'Sin coincidencias' : 'Bloqueada'}</Badge>
        ) : (
          <Badge tone="amber">Pendiente</Badge>
        )}
      </div>
      <p className="text-sm text-muted">
        Revisa propietario, cooperativa, exportador y bancos frente a OFAC (SDN), UE y ONU antes de publicar. Sin una revisión
        aprobada no se puede publicar ninguna oportunidad de esta finca.
      </p>
      {farm.sanctionsNote && (
        <p className="text-sm">
          Última nota ({date(farm.sanctionsCheckedAt)}): {farm.sanctionsNote}
        </p>
      )}
      <label>
        <span className="label">Nota de la revisión</span>
        <textarea rows={3} className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Listas consultadas, fecha, personas y empresas revisadas…" />
      </label>
      {error && <Alert tone="red">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={note.trim().length < 5} onClick={() => save(true)}>
          Sin coincidencias
        </button>
        <button type="button" className="btn-secondary" disabled={note.trim().length < 5} onClick={() => save(false)}>
          Bloquear finca
        </button>
      </div>
    </section>
  );
}

export default function FarmDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: farm, loading, reload } = useApi<FarmDetail>(`/admin/farms/${id}`);
  const [saved, setSaved] = useState(false);

  if (loading && !farm) return <Spinner />;
  if (!farm) return <Alert tone="red">Finca no encontrada</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={farm.name}
        back={{ href: '/admin/fincas', label: 'Fincas' }}
        actions={<Link href={`/admin/oportunidades/nueva?farmId=${farm.id}`} className="btn-primary">Nueva oportunidad</Link>}
      />
      <SanctionsCheck farm={farm} onDone={reload} />

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Oportunidades</h2>
        {farm.opportunities.length === 0 ? (
          <p className="text-sm text-muted">Esta finca aún no tiene oportunidades.</p>
        ) : (
          <ul className="card divide-y divide-line px-4">
            {farm.opportunities.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-3">
                <Link href={`/admin/oportunidades/${o.id}`}>{o.title}</Link>
                <Badge tone={OPPORTUNITY_STATUS[o.status].tone}>{OPPORTUNITY_STATUS[o.status].label}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Documentos de la finca</h2>
        {farm.documents.length > 0 && (
          <ul className="card divide-y divide-line px-4">
            {farm.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-3 text-sm">
                <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => openDocument(d.id)}>
                  {d.title}
                </button>
                <span className="text-muted">
                  {DOCUMENT_TYPES[d.type]} · {date(d.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <DocumentUpload farmId={farm.id} defaultType="LAND_TITLE" onDone={reload} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Datos de la finca</h2>
        {saved && <Alert tone="green">Cambios guardados</Alert>}
        <FarmForm
          key={farm.id}
          farmId={farm.id}
          initial={pickInput(farm)}
          onSaved={async () => {
            setSaved(true);
            await reload();
          }}
        />
      </section>
    </div>
  );
}

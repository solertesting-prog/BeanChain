'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert, Field } from '@/components/ui';

export interface FarmInput {
  name: string;
  crop: 'CACAO' | 'COFFEE';
  varieties: string[];
  country: string;
  region: string;
  municipality?: string | null;
  hectares: number;
  altitudeM?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  description: string;
  ownerName: string;
  ownerType: 'OWNER' | 'COOPERATIVE' | 'PRODUCER';
  productionHistory: { year: number; kg: number }[];
}

const EMPTY: FarmInput = {
  name: '',
  crop: 'CACAO',
  varieties: [],
  country: 'VE',
  region: '',
  municipality: '',
  hectares: 1,
  altitudeM: null,
  latitude: null,
  longitude: null,
  description: '',
  ownerName: '',
  ownerType: 'OWNER',
  productionHistory: [],
};

const optNum = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

export function FarmForm({ initial, farmId, onSaved }: { initial?: Partial<FarmInput>; farmId?: string; onSaved: (id: string) => void }) {
  const [f, setF] = useState<FarmInput>({ ...EMPTY, ...initial });
  const [varieties, setVarieties] = useState((initial?.varieties ?? []).join(', '));
  const [history, setHistory] = useState(
    (initial?.productionHistory ?? []).map((h) => `${h.year}: ${h.kg}`).join('\n'),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FarmInput>(k: K, v: FarmInput[K]) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const productionHistory: { year: number; kg: number }[] = [];
    for (const line of history.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const m = line.match(/^(\d{4})\s*[:=,;]\s*([\d.]+)$/);
      if (!m) return setError(`Línea de producción no válida: "${line}". Usa el formato 2024: 12000`);
      productionHistory.push({ year: Number(m[1]), kg: Number(m[2].replace(/\./g, '')) });
    }
    const body: Record<string, unknown> = {
      ...f,
      varieties: varieties.split(',').map((v) => v.trim()).filter(Boolean),
      productionHistory,
      municipality: f.municipality || undefined,
      altitudeM: f.altitudeM ?? undefined,
      latitude: f.latitude ?? undefined,
      longitude: f.longitude ?? undefined,
    };
    if (farmId) delete body.country;
    setBusy(true);
    try {
      const res = await api<{ id: string }>(farmId ? `/admin/farms/${farmId}` : '/admin/farms', {
        method: farmId ? 'PATCH' : 'POST',
        body,
      });
      onSaved(res.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido guardar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-4 p-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre de la finca" htmlFor="f-name">
          <input id="f-name" className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required />
        </Field>
        <Field label="Cultivo" htmlFor="f-crop">
          <select id="f-crop" className="input" value={f.crop} onChange={(e) => set('crop', e.target.value as FarmInput['crop'])}>
            <option value="CACAO">Cacao</option>
            <option value="COFFEE">Café</option>
          </select>
        </Field>
        <Field label="Variedades" htmlFor="f-var" hint="Separadas por comas: Criollo, Trinitario…">
          <input id="f-var" className="input" value={varieties} onChange={(e) => setVarieties(e.target.value)} />
        </Field>
        <Field label="Hectáreas" htmlFor="f-ha">
          <input id="f-ha" inputMode="decimal" className="input" value={String(f.hectares)} onChange={(e) => set('hectares', Number(e.target.value.replace(',', '.')) || 0)} />
        </Field>
        {!farmId && (
          <Field label="País (ISO)" htmlFor="f-country">
            <input id="f-country" maxLength={2} className="input uppercase" value={f.country} onChange={(e) => set('country', e.target.value.toUpperCase())} />
          </Field>
        )}
        <Field label="Estado / región" htmlFor="f-region">
          <input id="f-region" className="input" value={f.region} onChange={(e) => set('region', e.target.value)} />
        </Field>
        <Field label="Municipio" htmlFor="f-mun">
          <input id="f-mun" className="input" value={f.municipality ?? ''} onChange={(e) => set('municipality', e.target.value)} />
        </Field>
        <Field label="Altitud (m)" htmlFor="f-alt">
          <input id="f-alt" inputMode="numeric" className="input" value={f.altitudeM ?? ''} onChange={(e) => set('altitudeM', optNum(e.target.value))} />
        </Field>
        <Field label="Latitud" htmlFor="f-lat">
          <input id="f-lat" inputMode="decimal" className="input" value={f.latitude ?? ''} onChange={(e) => set('latitude', optNum(e.target.value))} />
        </Field>
        <Field label="Longitud" htmlFor="f-lng">
          <input id="f-lng" inputMode="decimal" className="input" value={f.longitude ?? ''} onChange={(e) => set('longitude', optNum(e.target.value))} />
        </Field>
        <Field label="Propietario o cooperativa" htmlFor="f-owner">
          <input id="f-owner" className="input" value={f.ownerName} onChange={(e) => set('ownerName', e.target.value)} />
        </Field>
        <Field label="Tipo" htmlFor="f-otype">
          <select id="f-otype" className="input" value={f.ownerType} onChange={(e) => set('ownerType', e.target.value as FarmInput['ownerType'])}>
            <option value="OWNER">Propietario</option>
            <option value="COOPERATIVE">Cooperativa</option>
            <option value="PRODUCER">Productor asociado</option>
          </select>
        </Field>
      </div>
      <Field label="Descripción" htmlFor="f-desc">
        <textarea id="f-desc" rows={5} className="input" value={f.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <Field label="Producción histórica (kg de grano seco)" htmlFor="f-hist" hint="Una línea por año: 2024: 12000">
        <textarea id="f-hist" rows={4} className="input font-mono text-sm" value={history} onChange={(e) => setHistory(e.target.value)} />
      </Field>
      {error && <Alert tone="red">{error}</Alert>}
      <button type="submit" className="btn-primary w-fit" disabled={busy}>
        {busy ? 'Guardando…' : farmId ? 'Guardar cambios' : 'Crear finca'}
      </button>
    </form>
  );
}

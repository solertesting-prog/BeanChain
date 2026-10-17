'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import type { OpportunityDetail } from '@/lib/types';
import {
  CROP,
  OPPORTUNITY_STATUS,
  RISK_LEVEL,
  countryName,
  date,
  daysLeft,
  eur,
  eurRound,
  num,
  pct,
  shortAddress,
  stageLabel,
} from '@/lib/format';
import { Alert, Badge, CopyButton, ProgressBar, Row, Spinner, Stat } from '@/components/ui';
import { CoverImage } from '@/components/opportunity-card';
import { StageTimeline } from '@/components/stage-timeline';
import { DocumentList } from '@/components/document-list';

function InvestBox({ o }: { o: OpportunityDetail }) {
  const { user } = useAuth();
  const left = daysLeft(o.closesAt);
  const open = o.status === 'PUBLISHED' && o.stats.tokensAvailable > 0 && (left === null || left > 0);
  const kycOk = user?.kyc.status === 'APPROVED';

  return (
    <div className="card flex flex-col gap-3 p-5">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-2xl">{eurRound(o.stats.raisedCents)}</span>
        <span className="text-sm text-muted">de {eurRound(o.targetAmountCents)}</span>
      </div>
      <ProgressBar value={o.stats.progressPct} label={`Captado ${o.stats.progressPct} %`} />
      <div className="flex justify-between text-sm text-muted">
        <span>{num(o.stats.investorsCount)} inversores</span>
        <span>{o.closesAt ? `Cierra el ${date(o.closesAt)}` : 'Sin fecha de cierre'}</span>
      </div>
      <div className="text-sm text-muted">
        {num(o.stats.tokensAvailable)} de {num(o.totalTokens)} tokens disponibles
        {o.stats.tokensReserved > 0 && ` · ${num(o.stats.tokensReserved)} reservados`}
      </div>

      {open ? (
        !user ? (
          <Link href={`/registro?siguiente=/oportunidades/${o.slug}/invertir`} className="btn-primary h-[52px]">
            Crea tu cuenta para invertir
          </Link>
        ) : !kycOk ? (
          <>
            <Link href="/perfil/verificacion" className="btn-primary h-[52px]">
              Verifica tu identidad para invertir
            </Link>
            <p className="text-center text-xs text-muted">Es obligatorio por normativa contra el blanqueo de capitales.</p>
          </>
        ) : (
          <Link href={`/oportunidades/${o.slug}/invertir`} className="btn-primary h-[52px]">
            Invertir en esta cosecha
          </Link>
        )
      ) : (
        <div className="rounded-xl bg-track px-4 py-3 text-center text-sm text-muted">
          {o.status === 'PUBLISHED' ? 'No quedan tokens disponibles' : `Captación cerrada · ${OPPORTUNITY_STATUS[o.status].label}`}
        </div>
      )}
      <p className="text-center text-xs text-muted">Tu capital está en riesgo. Inversión mínima: {o.minTokens} token{o.minTokens > 1 ? 's' : ''}.</p>
    </div>
  );
}

export default function OpportunityPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  // Recargar al cambiar de usuario: con sesión se ven más documentos.
  const { data: o, loading, error } = useApi<OpportunityDetail>(`/opportunities/${slug}`, [user?.id, user?.kyc.status]);

  if (loading && !o) return <Spinner />;
  if (error || !o) {
    return (
      <Alert tone="red" title="No hemos encontrado esta oportunidad">
        {error?.message} <Link href="/oportunidades">Volver a las oportunidades</Link>
      </Alert>
    );
  }

  const status = OPPORTUNITY_STATUS[o.status];
  const history = [...(o.farm.productionHistory ?? [])].sort((a, b) => a.year - b.year);
  const maxKg = Math.max(1, ...history.map((h) => h.kg));

  return (
    <div className="flex flex-col gap-8">
      <Link href="/oportunidades" className="inline-flex w-fit items-center gap-1 text-sm text-muted no-underline hover:text-ink">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Oportunidades
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-8">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone={status.tone}>{status.label}</Badge>
              <Badge tone="green">
                {CROP[o.farm.crop]}
                {o.farm.varieties.length ? ` · ${o.farm.varieties.join(', ')}` : ''}
              </Badge>
              <Badge tone="cacao">
                {countryName(o.farm.country)} · {o.farm.region}
              </Badge>
              <Badge tone="cacao">Cosecha {o.harvestYear}</Badge>
            </div>
            <h1 className="text-3xl leading-tight md:text-5xl">{o.title}</h1>
            <p className="text-lg text-muted">{o.summary}</p>
          </header>

          <div className="h-56 overflow-hidden rounded-card md:h-80">
            <CoverImage src={o.coverImageUrl} alt={`Finca ${o.farm.name}`} />
          </div>

          <div className="lg:hidden">
            <InvestBox o={o} />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Rentabilidad estimada" value={pct(o.expectedReturnBps)} sub="no garantizada" />
            <Stat label="Plazo" value={`${o.termMonths} meses`} sub={o.expectedPayoutAt ? `pago est. ${date(o.expectedPayoutAt)}` : undefined} />
            <Stat label="Precio por token" value={eur(o.tokenPriceCents)} />
            <Stat label="Riesgo" value={RISK_LEVEL[o.riskLevel]} />
          </div>

          <section aria-labelledby="desc">
            <h2 id="desc" className="section-title mb-3">
              La oportunidad
            </h2>
            <div className="whitespace-pre-line text-[15px] leading-relaxed">{o.description}</div>
            {o.buyerName && (
              <p className="mt-3 text-sm">
                <span className="text-muted">Comprador comprometido:</span> <span className="font-medium">{o.buyerName}</span>
              </p>
            )}
          </section>

          <section aria-labelledby="token" className="flex flex-col gap-3">
            <h2 id="token" className="section-title">
              El token
            </h2>
            <div className="card px-4 py-1">
              <Row label="Nombre">{o.token.name}</Row>
              <Row label="Símbolo">{o.token.symbol}</Row>
              <Row label="Estándar">{o.token.standard} permisionado</Row>
              <Row label="Emisión total">{num(o.totalTokens)} tokens</Row>
              <Row label="Contrato" last>
                {o.token.address ? (
                  <span className="inline-flex items-center gap-1">
                    {o.token.explorerUrl ? (
                      <a href={o.token.explorerUrl} target="_blank" rel="noreferrer" className="font-mono text-sm">
                        {shortAddress(o.token.address)}
                      </a>
                    ) : (
                      <span className="font-mono text-sm">{shortAddress(o.token.address)}</span>
                    )}
                    <CopyButton value={o.token.address} label="Copiar" />
                  </span>
                ) : (
                  'Se despliega al publicar'
                )}
              </Row>
            </div>
            <p className="text-sm text-muted">
              Cada token da derecho a una parte proporcional de los ingresos netos de la venta de esta cosecha. Sólo puede
              transferirse entre inversores verificados y no admite residentes de: {o.blockedCountries.map(countryName).join(', ')}.
            </p>
          </section>

          <section aria-labelledby="rent" className="flex flex-col gap-3">
            <h2 id="rent" className="section-title">
              Cómo se genera tu rentabilidad
            </h2>
            {[
              'Tu inversión financia el cultivo, la cosecha y el beneficio del grano.',
              `${o.buyerName ?? 'El comprador'} paga el ${CROP[o.farm.crop].toLowerCase()} al precio pactado.`,
              'El contrato inteligente reparte capital y rendimiento a cada token.',
            ].map((t, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-leaf-light text-[13px] font-semibold text-leaf-dark" aria-hidden="true">
                  {i + 1}
                </span>
                <span>{t}</span>
              </div>
            ))}
            <p className="text-sm text-muted">
              Ejemplo: con 10 tokens ({eur(o.tokenPriceCents * 10)}) y la rentabilidad estimada, recibirías unos{' '}
              {eur(Math.round(o.tokenPriceCents * 10 * (1 + o.expectedReturnBps / 10_000)))} al final del plazo. Puede ser
              menos, o nada, si la cosecha o la venta fallan.
            </p>
          </section>

          <section aria-labelledby="estado" className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <h2 id="estado" className="section-title">
                Estado de la cosecha
              </h2>
              <StageTimeline current={o.currentStage} />
              <p className="text-sm text-muted">Etapa actual: {stageLabel(o.currentStage)}</p>
            </div>
            <div className="flex flex-col gap-3">
              <h2 className="section-title">Novedades</h2>
              {o.updates.length === 0 ? (
                <p className="text-sm text-muted">Publicaremos aquí cada avance de la finca.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {o.updates.slice(0, 5).map((u) => (
                    <li key={u.id} className="card p-4">
                      <div className="text-xs text-muted">
                        {date(u.publishedAt)} · {stageLabel(u.stage)}
                      </div>
                      <div className="font-semibold">{u.title}</div>
                      <p className="mt-1 whitespace-pre-line text-sm text-muted">{u.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section aria-labelledby="finca" className="flex flex-col gap-3">
            <h2 id="finca" className="section-title">
              La finca
            </h2>
            <div className="card px-4 py-1">
              <Row label="Nombre">{o.farm.name}</Row>
              <Row label="Ubicación">
                {[o.farm.municipality, o.farm.region, countryName(o.farm.country)].filter(Boolean).join(', ')}
              </Row>
              <Row label="Superficie">{o.farm.hectares.toLocaleString('es-ES')} ha</Row>
              {o.farm.altitudeM !== null && <Row label="Altitud">{num(o.farm.altitudeM)} m</Row>}
              <Row label="Gestiona" last>
                {o.farm.ownerName}
              </Row>
            </div>
            <p className="whitespace-pre-line text-[15px] leading-relaxed">{o.farm.description}</p>
            {history.length > 0 && (
              <figure className="card p-4">
                <figcaption className="mb-3 text-sm font-medium">Producción histórica (kg de grano seco)</figcaption>
                <div className="flex flex-col gap-2">
                  {history.map((h) => (
                    <div key={h.year} className="grid grid-cols-[48px_1fr_80px] items-center gap-3 text-sm">
                      <span className="text-muted">{h.year}</span>
                      <div className="h-3 rounded-full bg-track">
                        <div className="h-full rounded-full bg-cacao" style={{ width: `${(h.kg / maxKg) * 100}%` }} />
                      </div>
                      <span className="text-right tabular-nums">{num(h.kg)}</span>
                    </div>
                  ))}
                </div>
              </figure>
            )}
          </section>

          <section aria-labelledby="riesgos" className="flex flex-col gap-3">
            <h2 id="riesgos" className="section-title">
              Riesgos principales
            </h2>
            <div className="flex flex-wrap gap-2">
              {o.risks.map((r) => (
                <span key={r} className="rounded-full border border-line bg-white px-3 py-1.5 text-sm">
                  {r}
                </span>
              ))}
            </div>
            <Link href="/riesgos" className="text-sm font-medium">
              Leer todos los riesgos de invertir en cosechas
            </Link>
          </section>

          <section aria-labelledby="docs" className="flex flex-col gap-2">
            <h2 id="docs" className="section-title">
              Documentos
            </h2>
            <DocumentList documents={o.documents} />
            {!o.viewer.kycApproved && !o.viewer.isInvestor && (
              <p className="text-sm text-muted">
                {user ? 'Verifica tu identidad' : 'Inicia sesión y verifica tu identidad'} para ver el informe agronómico, la
                carta del comprador y el resto de documentación para inversores.
              </p>
            )}
          </section>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <InvestBox o={o} />
          </div>
        </aside>
      </div>
    </div>
  );
}

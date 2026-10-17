import Link from 'next/link';
import { CROP, OPPORTUNITY_STATUS, countryName, daysLeft, eurRound, pct } from '@/lib/format';
import type { OpportunitySummary } from '@/lib/types';
import { Badge, ProgressBar } from './ui';

export function CoverImage({ src, alt, className = '' }: { src: string | null; alt: string; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={`h-full w-full object-cover ${className}`} />;
  }
  return (
    <div className={`flex h-full w-full items-end bg-cacao p-4 text-cacao-cream ${className}`} aria-hidden="true">
      <svg width="64" height="64" viewBox="0 0 32 32" className="opacity-40">
        <ellipse cx="16" cy="16" rx="9" ry="13" fill="#F1E6DA" />
      </svg>
    </div>
  );
}

export function OpportunityCard({ o }: { o: OpportunitySummary }) {
  const status = OPPORTUNITY_STATUS[o.status];
  const left = daysLeft(o.closesAt);
  return (
    <Link
      href={`/oportunidades/${o.slug}`}
      className="card group flex flex-col overflow-hidden text-ink no-underline transition-shadow hover:text-ink hover:shadow-[0_8px_30px_rgba(42,28,21,0.08)]"
    >
      <div className="relative h-44">
        <CoverImage src={o.coverImageUrl} alt={`Finca ${o.farm.name}`} />
        <div className="absolute left-3 top-3">
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="green">{CROP[o.farm.crop]}{o.farm.varieties[0] ? ` · ${o.farm.varieties[0]}` : ''}</Badge>
          <Badge tone="cacao">
            {countryName(o.farm.country)} · {o.farm.region}
          </Badge>
        </div>
        <h3 className="text-xl leading-snug group-hover:underline">{o.title}</h3>
        <p className="line-clamp-2 text-sm text-muted">{o.summary}</p>
        <div className="mt-auto grid grid-cols-3 gap-2 text-sm">
          <div>
            <div className="text-xs text-muted">Rentab. est.</div>
            <div className="font-semibold">{pct(o.expectedReturnBps)}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Plazo</div>
            <div className="font-semibold">{o.termMonths} meses</div>
          </div>
          <div>
            <div className="text-xs text-muted">Token</div>
            <div className="font-semibold">{eurRound(o.tokenPriceCents)}</div>
          </div>
        </div>
        <div>
          <ProgressBar value={o.stats.progressPct} label={`Captado ${o.stats.progressPct} %`} />
          <div className="mt-1.5 flex justify-between text-xs text-muted">
            <span>
              {eurRound(o.stats.raisedCents)} de {eurRound(o.targetAmountCents)}
            </span>
            {o.status === 'PUBLISHED' && left !== null && <span>{left > 0 ? `Quedan ${left} días` : 'Cierra hoy'}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}

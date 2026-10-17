'use client';

import Link from 'next/link';
import { useApi } from '@/lib/use-api';
import type { OpportunitySummary } from '@/lib/types';
import { OpportunityCard } from '@/components/opportunity-card';
import { Spinner } from '@/components/ui';

const STEPS = [
  {
    title: 'Eliges una cosecha',
    body: 'Cada oportunidad es una cosecha concreta de una finca verificada, con su contrato, informe agronómico y comprador comprometido.',
  },
  {
    title: 'Financias el cultivo',
    body: 'Tu inversión paga la recolección, la fermentación, el secado y la exportación. A cambio recibes tokens de esa cosecha.',
  },
  {
    title: 'Sigues cada etapa',
    body: 'Fotos, informes y documentos se registran con su huella en la blockchain para que nadie pueda alterarlos.',
  },
  {
    title: 'Cobras al vender',
    body: 'Cuando el comprador paga el cacao, el contrato inteligente reparte capital y rendimiento a cada token.',
  },
];

export default function HomePage() {
  const { data, loading } = useApi<OpportunitySummary[]>('/opportunities');
  const open = (data ?? []).filter((o) => o.status === 'PUBLISHED').slice(0, 3);
  const featured = open.length > 0 ? open : (data ?? []).slice(0, 3);

  return (
    <div className="flex flex-col gap-16">
      <section className="grid items-center gap-8 md:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-5">
          <span className="chip w-fit bg-leaf-light text-leaf-dark">Cacao y café de origen · Venezuela</span>
          <h1 className="text-4xl leading-[1.08] md:text-6xl">Financia la cosecha. Participa en la venta.</h1>
          <p className="max-w-xl text-lg text-muted">
            BeanChain conecta a inversores con fincas de cacao fino y café. Prefinancias una cosecha concreta y recibes
            una parte de lo que paga el comprador, a través de un token regulado.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/oportunidades" className="btn-primary">
              Ver oportunidades
            </Link>
            <Link href="/como-funciona" className="btn-secondary">
              Cómo funciona
            </Link>
          </div>
          <p className="text-xs text-muted">Tu capital está en riesgo. Lee los riesgos antes de invertir.</p>
        </div>
        <div className="relative hidden h-[420px] overflow-hidden rounded-[28px] bg-cacao md:block" aria-hidden="true">
          <svg viewBox="0 0 400 420" className="h-full w-full">
            <rect width="400" height="420" fill="#5B3A26" />
            {Array.from({ length: 7 }).map((_, i) => (
              <ellipse
                key={i}
                cx={80 + (i % 3) * 120}
                cy={70 + Math.floor(i / 3) * 140}
                rx="34"
                ry="54"
                fill="none"
                stroke="#F1E6DA"
                strokeOpacity={0.18 + (i % 3) * 0.08}
                strokeWidth="2"
                transform={`rotate(${(i % 2 ? 1 : -1) * 18} ${80 + (i % 3) * 120} ${70 + Math.floor(i / 3) * 140})`}
              />
            ))}
            <rect x="32" y="300" width="240" height="88" rx="16" fill="#F7F3EE" />
            <text x="52" y="332" fontFamily="var(--font-sans)" fontSize="13" fill="#6B5A4E">Token ERC-3643 por cosecha</text>
            <text x="52" y="366" fontFamily="var(--font-display)" fontSize="26" fill="#2A1C15">Trazable de origen</text>
          </svg>
        </div>
      </section>

      <section aria-labelledby="destacadas">
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 id="destacadas" className="text-3xl">
            Oportunidades
          </h2>
          <Link href="/oportunidades" className="text-sm font-medium">
            Ver todas
          </Link>
        </div>
        {loading ? (
          <Spinner />
        ) : featured.length === 0 ? (
          <div className="card p-6 text-muted">Pronto publicaremos las primeras cosechas.</div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((o) => (
              <OpportunityCard key={o.id} o={o} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="como" className="grid gap-8 md:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 id="como" className="text-3xl">
            Del cacaotal a tu cartera
          </h2>
          <p className="mt-3 text-muted">
            No compras la tierra: financias una cosecha concreta con un plazo corto y un resultado medible. Así el
            riesgo de cada finca queda separado y es fácil de auditar.
          </p>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-leaf-light text-sm font-semibold text-leaf-dark" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="mt-3 text-lg">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

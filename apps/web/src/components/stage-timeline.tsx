import { STAGES } from '@/lib/format';
import type { HarvestStage } from '@/lib/types';

export function StageTimeline({ current }: { current: HarvestStage | null }) {
  const idx = current ? STAGES.findIndex((s) => s.key === current) : -1;
  return (
    <ol className="card flex flex-col gap-3.5 p-4">
      {STAGES.map((s, i) => {
        const done = i < idx;
        const now = i === idx;
        return (
          <li key={s.key} className="flex items-center gap-3" aria-current={now ? 'step' : undefined}>
            <span
              className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-semibold ${
                done ? 'bg-leaf text-white' : now ? 'bg-amber-soft text-amber-text' : 'bg-track text-muted'
              }`}
              aria-hidden="true"
            >
              {done ? '✓' : i + 1}
            </span>
            <span className={done || now ? 'text-ink' : 'text-muted'}>
              {s.label}
              {now && <span className="sr-only"> (etapa actual)</span>}
              {done && <span className="sr-only"> (completada)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

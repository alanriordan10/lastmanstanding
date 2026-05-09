import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';

type PillTone = 'neutral' | 'brand' | 'success' | 'danger' | 'warn' | 'info';

const toneClasses: Record<PillTone, string> = {
  neutral: 'border-white/14 bg-white/8 text-gray-200',
  brand: 'border-brand-400/35 bg-brand-500/12 text-brand-100',
  success: 'border-green-400/35 bg-green-500/12 text-green-200',
  danger: 'border-red-400/35 bg-red-500/12 text-red-200',
  warn: 'border-amber-400/35 bg-amber-500/12 text-amber-200',
  info: 'border-sky-400/35 bg-sky-500/12 text-sky-200',
};

export function StatusPill({
  children,
  tone = 'neutral',
  className,
  style,
}: {
  children: ReactNode;
  tone?: PillTone;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]',
        toneClasses[tone],
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}

export function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] px-3 py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="text-xl font-black text-white sm:text-2xl">{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-200/85">{label}</div>
    </div>
  );
}

export function FilterPill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-full border px-3 py-1 text-xs transition',
        active
          ? 'border-brand-500/50 bg-brand-500/10 text-brand-200'
          : 'border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.06]',
      )}
    >
      {children}
    </button>
  );
}


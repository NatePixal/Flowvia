'use client';

import Link from 'next/link';
import type { ElementType, ReactNode } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type LuxuryMetricCardProps = {
  title: string;
  value: ReactNode;
  currency?: string;
  trendValue?: number;
  trendDirection?: 'up' | 'down' | 'flat';
  description?: string;
  icon?: ElementType;
  isLoading?: boolean;
  status?: 'verified' | 'needs_audit' | 'repair_required' | 'neutral';
  href?: string;
};

function trendMeta(direction: LuxuryMetricCardProps['trendDirection']) {
  if (direction === 'up') return { Icon: ArrowUpRight, className: 'text-emerald-600 dark:text-emerald-300' };
  if (direction === 'down') return { Icon: ArrowDownRight, className: 'text-red-600 dark:text-red-300' };
  return { Icon: Minus, className: 'text-slate-500 dark:text-slate-300' };
}

function statusClass(status: LuxuryMetricCardProps['status']) {
  if (status === 'verified') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (status === 'needs_audit') return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  if (status === 'repair_required') return 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300';
  return 'border-slate-300/80 bg-slate-500/5 text-slate-600 dark:border-slate-700 dark:text-slate-300';
}

export default function LuxuryMetricCard({
  title,
  value,
  currency,
  trendValue,
  trendDirection = 'flat',
  description,
  icon: Icon,
  isLoading = false,
  status = 'neutral',
  href,
}: LuxuryMetricCardProps) {
  const { Icon: TrendIcon, className: trendClassName } = trendMeta(trendDirection);

  const content = (
    <div
      className={cn(
        'group relative min-h-[144px] overflow-hidden rounded-card border border-flowvia-border-light/80 bg-white p-4 shadow-editorialLight transition duration-300 hover:-translate-y-0.5 hover:shadow-cardLift dark:border-flowvia-border-dark dark:bg-flowvia-panel-navy dark:shadow-editorialDark',
        href && 'cursor-pointer'
      )}
    >
      <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-flowvia-primary/50 to-transparent" />
      <div className="pointer-events-none absolute bottom-3 right-3 h-12 w-12 rounded-full border border-flowvia-border-light/70 opacity-30 transition group-hover:scale-110 dark:border-flowvia-border-dark" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted-foreground">{title}</p>
          <div className="mt-3 min-h-9">
            {isLoading ? (
              <Skeleton className="h-9 w-32" />
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="financial-nums text-2xl font-semibold tracking-financial text-foreground">{value}</span>
                {currency && <span className="financial-nums text-xs font-semibold uppercase text-muted-foreground">{currency}</span>}
              </div>
            )}
          </div>
        </div>
        {Icon && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-card border border-flowvia-border-light/70 bg-flowvia-canvas-light text-flowvia-primary dark:border-flowvia-border-dark dark:bg-flowvia-panel-ink">
            <Icon className="size-5" />
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {trendValue !== undefined ? (
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold', trendClassName)}>
            <TrendIcon className="size-3.5" />
            {Math.abs(trendValue).toFixed(1)}%
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
        <span className={cn('inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold', statusClass(status))}>
          {status === 'needs_audit' ? 'Audit' : status === 'repair_required' ? 'Repair' : status === 'verified' ? 'Verified' : 'Live'}
        </span>
      </div>

      {trendValue !== undefined && description && (
        <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{description}</p>
      )}

      {href && (
        <span className="absolute bottom-4 right-4 text-muted-foreground opacity-0 transition group-hover:opacity-100">
          <ArrowRight className="size-4" />
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
        {content}
      </Link>
    );
  }

  return content;
}

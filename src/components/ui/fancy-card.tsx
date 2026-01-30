'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardProps } from '@/components/ui/card';

export interface FancyCardProps extends CardProps {
  glowSize?: 'sm' | 'md' | 'lg';
}

const FancyCard = React.forwardRef<HTMLDivElement, FancyCardProps>(
  ({ className, children, glowSize = 'md', ...props }, ref) => {
    return (
      <div className={cn('group relative', className)}>
        <div
          className={cn(
            'absolute -inset-0.5 rounded-[calc(var(--radius)+4px)] bg-gradient-to-r from-teal-500 via-sky-500 to-blue-500 opacity-0 blur-lg transition-all duration-300 motion-reduce:transition-none group-hover:opacity-10 group-hover:blur-xl',
            {
              'blur-md group-hover:blur-2xl': glowSize === 'sm',
              'blur-lg group-hover:blur-xl': glowSize === 'md',
              'blur-xl group-hover:blur-3xl': glowSize === 'lg',
            }
          )}
        ></div>
        <Card
          ref={ref}
          className="relative rounded-2xl border-border-subtle bg-card text-card-foreground shadow-sm transition-all duration-300 ease-out motion-reduce:transition-none group-hover:-translate-y-px group-hover:border-border-strong group-hover:shadow-lg motion-reduce:group-hover:transform-none"
          {...props}
        >
          {children}
        </Card>
      </div>
    );
  }
);
FancyCard.displayName = 'FancyCard';

export { FancyCard };

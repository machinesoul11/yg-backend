import React from 'react';
import { cn } from '@/lib/utils/brand';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'gold' | 'rose' | 'sage' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md' | 'lg';
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'gold', size = 'md', children, ...props }, ref) => {
    const sizeClasses = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-3 py-1 text-body-sm',
      lg: 'px-4 py-1.5 text-body',
    };

    return (
      <span
        ref={ref}
        className={cn('badge', `badge-${variant}`, sizeClasses[size], className)}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils/brand';

export interface LogoProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'icon' | 'text';
  priority?: boolean;
}

export const Logo = React.forwardRef<HTMLDivElement, LogoProps>(
  ({ className, size = 'md', variant = 'full', priority = false, ...props }, ref) => {
    const sizeMap = {
      sm: { width: 120, height: 32 },
      md: { width: 180, height: 48 },
      lg: { width: 240, height: 64 },
      xl: { width: 360, height: 96 },
    };

    const dimensions = sizeMap[size];

    if (variant === 'text') {
      const textSizeClasses = {
        sm: 'text-xl',
        md: 'text-2xl',
        lg: 'text-4xl',
        xl: 'text-6xl',
      };

      return (
        <div
          ref={ref}
          className={cn(
            'font-display font-bold tracking-tight text-brand-gold',
            textSizeClasses[size],
            className
          )}
          {...props}
        >
          YES GODDESS
        </div>
      );
    }

    // Full logo image (default) or icon variant
    return (
      <div
        ref={ref}
        className={cn('relative inline-block', className)}
        style={{ width: dimensions.width, height: dimensions.height }}
        {...props}
      >
        <Image
          src="/logo/yesgoddesslogo.png"
          alt="YES GODDESS"
          width={dimensions.width}
          height={dimensions.height}
          priority={priority}
          className="object-contain"
        />
      </div>
    );
  }
);

Logo.displayName = 'Logo';

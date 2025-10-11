/**
 * Verified Badge Component
 * Shows a verified checkmark badge next to user names/profiles
 */

import React from 'react';
import { cn } from '@/lib/utils/brand';

export interface VerifiedBadgeProps {
  /**
   * Whether to show the "Verified" text label
   */
  showLabel?: boolean;
  
  /**
   * Size of the badge
   */
  size?: 'sm' | 'md' | 'lg';
  
  /**
   * Additional className
   */
  className?: string;
  
  /**
   * Tooltip text (defaults to "Verified email address")
   */
  tooltipText?: string;
}

export const VerifiedBadge = React.forwardRef<HTMLSpanElement, VerifiedBadgeProps>(
  ({ showLabel = false, size = 'md', className, tooltipText = 'Verified email address' }, ref) => {
    const sizeClasses = {
      sm: {
        icon: 'w-4 h-4',
        text: 'text-xs',
        gap: 'gap-1',
      },
      md: {
        icon: 'w-5 h-5',
        text: 'text-sm',
        gap: 'gap-1.5',
      },
      lg: {
        icon: 'w-6 h-6',
        text: 'text-base',
        gap: 'gap-2',
      },
    };

    const sizes = sizeClasses[size];

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center',
          sizes.gap,
          className
        )}
        title={tooltipText}
        aria-label={tooltipText}
      >
        <svg
          className={cn(
            sizes.icon,
            'text-brand-gold',
            'flex-shrink-0'
          )}
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-hidden={showLabel ? 'true' : 'false'}
        >
          <path
            fillRule="evenodd"
            d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
        {showLabel && (
          <span className={cn('font-medium text-brand-gold', sizes.text)}>
            Verified
          </span>
        )}
      </span>
    );
  }
);

VerifiedBadge.displayName = 'VerifiedBadge';

/**
 * Conditional Verified Badge
 * Only shows if the user is verified
 */
export interface ConditionalVerifiedBadgeProps extends VerifiedBadgeProps {
  /**
   * Whether the user/email is verified
   */
  isVerified: boolean;
}

export const ConditionalVerifiedBadge: React.FC<ConditionalVerifiedBadgeProps> = ({
  isVerified,
  ...props
}) => {
  if (!isVerified) return null;
  return <VerifiedBadge {...props} />;
};

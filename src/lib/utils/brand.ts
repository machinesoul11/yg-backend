import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge Tailwind CSS classes
 * Combines clsx and tailwind-merge for optimal class handling
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Get brand color class for Tailwind
 */
export function getBrandColorClass(
  color: 'gold' | 'rose' | 'sage' | 'cream' | 'black' | 'white',
  variant: 'DEFAULT' | 'light' | 'dark' = 'DEFAULT',
  type: 'bg' | 'text' | 'border' = 'text'
): string {
  return `${type}-brand-${color}${variant !== 'DEFAULT' ? `-${variant}` : ''}`;
}

/**
 * Get status color class for Tailwind
 */
export function getStatusColorClass(
  status: 'success' | 'warning' | 'error' | 'info' | 'pending' | 'active' | 'inactive',
  type: 'bg' | 'text' | 'border' = 'text'
): string {
  const statusMap = {
    success: 'brand-sage',
    warning: 'brand-gold',
    error: 'brand-rose-dark',
    info: 'brand-rose-light',
    pending: 'brand-cream',
    active: 'brand-sage',
    inactive: 'gray-400',
  };
  
  return `${type}-${statusMap[status]}`;
}

/**
 * Format brand gradient for inline styles
 */
export function getBrandGradient(
  type: 'gold' | 'rose' | 'dark' | 'radial'
): string {
  const gradients = {
    gold: 'linear-gradient(135deg, #D4AF37 0%, #F5E6D3 100%)',
    rose: 'linear-gradient(135deg, #E8B4B8 0%, #F5E1E4 100%)',
    dark: 'linear-gradient(135deg, #000000 0%, #1A1A1A 100%)',
    radial: 'radial-gradient(circle, #D4AF37 0%, #F5E6D3 100%)',
  };
  
  return gradients[type];
}

/**
 * Get responsive font size class
 */
export function getResponsiveFontClass(
  size: 'display' | 'heading' | 'body',
  level: 1 | 2 | 3 | 4 | 5 | 6 = 1
): string {
  if (size === 'display') {
    const displays = ['display-xl', 'display-lg', 'display-md', 'display-sm'];
    return `text-${displays[level - 1] || displays[0]}`;
  }
  
  if (size === 'heading') {
    return `text-h${level}`;
  }
  
  const bodySizes = ['body-lg', 'body', 'body-sm', 'body-xs'];
  return `text-${bodySizes[level - 1] || bodySizes[1]}`;
}

/**
 * Generate button classes based on variant
 */
export function getButtonClasses(
  variant: 'primary' | 'secondary' | 'outline' | 'ghost' | 'rose' | 'sage' = 'primary',
  size: 'sm' | 'md' | 'lg' = 'md',
  className?: string
): string {
  const baseClasses = 'btn';
  const variantClasses = `btn-${variant}`;
  
  const sizeClasses = {
    sm: 'px-4 py-2 text-body-sm',
    md: 'px-6 py-3 text-body',
    lg: 'px-8 py-4 text-body-lg',
  };
  
  return cn(baseClasses, variantClasses, sizeClasses[size], className);
}

/**
 * Generate card classes based on variant
 */
export function getCardClasses(
  variant: 'default' | 'hover' | 'gold' | 'elevated' = 'default',
  className?: string
): string {
  const variantClasses = {
    default: 'card',
    hover: 'card-hover',
    gold: 'card-gold',
    elevated: 'card shadow-medium',
  };
  
  return cn(variantClasses[variant], className);
}

/**
 * Generate badge classes
 */
export function getBadgeClasses(
  variant: 'gold' | 'rose' | 'sage' | 'success' | 'warning' | 'error' = 'gold',
  className?: string
): string {
  return cn('badge', `badge-${variant}`, className);
}

/**
 * Format currency for display
 */
export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, length: number = 100): string {
  if (text.length <= length) return text;
  return `${text.slice(0, length).trim()  }...`;
}

/**
 * Generate initials from name
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Get contrast text color for a background
 */
export function getContrastTextColor(backgroundColor: string): 'text-brand-white' | 'text-brand-black' {
  // Simple contrast check - in production you might want a more sophisticated algorithm
  const darkColors = ['black', 'gold', 'sage', 'rose'];
  const colorName = backgroundColor.toLowerCase();
  
  for (const dark of darkColors) {
    if (colorName.includes(dark)) {
      return 'text-brand-white';
    }
  }
  
  return 'text-brand-black';
}

import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = '',
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-md transition-colors duration-100 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none';

    const variantStyles = {
      primary:
        'bg-[#047857] hover:bg-[#065f46] active:bg-[#064e3b] text-white focus:ring-emerald-600 border border-[#047857]',
      secondary:
        'bg-white hover:bg-[#fafaf7] active:bg-zinc-100 text-zinc-800 border border-[#e6e6e1] focus:ring-zinc-300 shadow-2xs',
      outline:
        'bg-transparent hover:bg-white text-zinc-700 border border-[#d4d4ce] focus:ring-zinc-300',
      ghost:
        'bg-transparent hover:bg-zinc-100 text-zinc-600 focus:ring-zinc-200',
      danger:
        'bg-rose-700 hover:bg-rose-800 text-white focus:ring-rose-500 border border-rose-700',
      warning:
        'bg-amber-700 hover:bg-amber-800 text-white focus:ring-amber-500 border border-amber-700',
    };

    const sizeStyles = {
      sm: 'px-2.5 py-1 text-xs gap-1.5 h-7',
      md: 'px-3.5 py-1.5 text-xs sm:text-sm gap-2 h-8.5',
      lg: 'px-4 py-2 text-sm gap-2.5 h-10',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        ) : (
          leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!isLoading && rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';

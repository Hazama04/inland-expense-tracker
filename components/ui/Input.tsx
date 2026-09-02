import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftIcon, rightIcon, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-2.5 flex items-center pointer-events-none text-zinc-400">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full bg-white border text-zinc-900 rounded-md text-xs sm:text-sm transition-colors placeholder:text-zinc-400 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] ${
              leftIcon ? 'pl-8' : 'pl-2.5'
            } ${rightIcon ? 'pr-8' : 'pr-2.5'} py-1.5 ${
              error
                ? 'border-rose-400 focus:border-rose-600 focus:ring-rose-600'
                : 'border-[#e6e6e1] hover:border-zinc-400'
            } ${className}`}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-2.5 flex items-center text-zinc-400">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = '', id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <select
            ref={ref}
            id={selectId}
            className={`w-full appearance-none bg-white border text-zinc-900 rounded-md text-xs sm:text-sm transition-colors pl-2.5 pr-8 py-1.5 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] cursor-pointer ${
              error
                ? 'border-rose-400 focus:border-rose-600 focus:ring-rose-600'
                : 'border-[#e6e6e1] hover:border-zinc-400'
            } ${className}`}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-white text-zinc-900">
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 pointer-events-none text-zinc-400" />
        </div>
        {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';

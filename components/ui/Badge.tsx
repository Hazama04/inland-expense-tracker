import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral';
  size?: 'sm' | 'md';
}

export function Badge({
  children,
  className = '',
  variant = 'default',
  size = 'md',
  ...props
}: BadgeProps) {
  const variantStyles = {
    default: 'bg-zinc-50 text-zinc-700 border-zinc-200',
    success: 'bg-[#f2f8f5] text-[#047857] border-[#cbe4d7] font-medium',
    warning: 'bg-[#fffbeb] text-[#92400e] border-[#fde68a] font-medium',
    danger: 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca] font-medium',
    info: 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe] font-medium',
    purple: 'bg-[#faf5ff] text-[#6b21a8] border-[#e9d5ff] font-medium',
    neutral: 'bg-zinc-50 text-zinc-600 border-zinc-200',
  };

  const sizeStyles = {
    sm: 'px-1.5 py-0.2 text-[10px] gap-1 leading-tight',
    md: 'px-2 py-0.5 text-[11px] gap-1.5 leading-tight',
  };

  return (
    <span
      className={`inline-flex items-center rounded border ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

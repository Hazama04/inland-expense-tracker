import React from 'react';
import { Inbox } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-10 px-4 ${className}`}
    >
      <div className="w-8 h-8 rounded bg-zinc-100 text-zinc-500 flex items-center justify-center mb-2 border border-zinc-200">
        {icon || <Inbox className="w-4 h-4" />}
      </div>
      <h4 className="text-xs font-semibold text-zinc-900">{title}</h4>
      <p className="text-[11px] text-zinc-500 max-w-xs mt-0.5 mb-3 leading-normal">{description}</p>
      {actionLabel && onAction && (
        <Button size="sm" variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

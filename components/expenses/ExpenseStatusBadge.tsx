import React from 'react';
import { Badge } from '../ui/Badge';
import { getStatusBadgeVariant, getStatusLabel } from '@/lib/client/format';
import { ExpenseStatus } from '@/app/generated/prisma/enums';

export function ExpenseStatusBadge({ status }: { status: ExpenseStatus | string }) {
  const variant = getStatusBadgeVariant(status);
  const label = getStatusLabel(status);

  return (
    <Badge variant={variant} size="sm">
      <span>{label}</span>
    </Badge>
  );
}

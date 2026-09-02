import { ExpenseStatus } from '@/app/generated/prisma/enums';

export function formatIDR(amount: number | string | { toString(): string } | null | undefined): string {
  if (amount === null || amount === undefined) return 'Rp 0';
  const num = typeof amount === 'number' ? amount : parseFloat(amount.toString());
  if (isNaN(num)) return 'Rp 0';

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function getStatusLabel(status: ExpenseStatus | string): string {
  switch (status) {
    case 'AUTO':
      return 'Auto OCR';
    case 'DIKOREKSI_MANUAL':
      return 'Dikoreksi';
    case 'INPUT_MANUAL':
      return 'Manual';
    case 'PERLU_REVIEW':
      return 'Perlu Review';
    default:
      return status;
  }
}

export function getStatusBadgeVariant(
  status: ExpenseStatus | string
): 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' {
  switch (status) {
    case 'AUTO':
      return 'info';
    case 'DIKOREKSI_MANUAL':
      return 'purple';
    case 'INPUT_MANUAL':
      return 'default';
    case 'PERLU_REVIEW':
      return 'warning';
    default:
      return 'default';
  }
}

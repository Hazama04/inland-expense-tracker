import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/Button';

export interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
}

export function ExpensePagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: PaginationProps) {
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 px-3 py-2 bg-white rounded-lg border border-[#e6e6e1] text-xs text-zinc-500">
      <div>
        Menampilkan <span className="font-semibold text-zinc-900">{start}</span> -{' '}
        <span className="font-semibold text-zinc-900">{end}</span> dari{' '}
        <span className="font-semibold text-zinc-900">{total}</span> transaksi
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
        >
          Sebelumnya
        </Button>
        <span className="px-1.5 font-medium text-zinc-700 text-xs">
          Halaman {page} dari {Math.max(totalPages, 1)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
        >
          Berikutnya
        </Button>
      </div>
    </div>
  );
}

import React from 'react';
import { ExpenseStatusBadge } from './ExpenseStatusBadge';
import { TableSkeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { formatIDR, formatDate } from '@/lib/client/format';
import { ArrowUpRight, Receipt } from 'lucide-react';

export interface ExpenseListItem {
  id: string;
  merchant: string;
  amount: number | string | { toString(): string };
  transactionDate: string | Date;
  status: string;
  notes?: string | null;
  staff: {
    id: string;
    name: string;
    phoneNumber: string;
  };
  category?: {
    id: string;
    name: string;
  } | null;
}

export interface ExpenseTableProps {
  expenses: ExpenseListItem[];
  isLoading: boolean;
  onSelectExpense: (id: string) => void;
  onResetFilters?: () => void;
}

export function ExpenseTable({
  expenses,
  isLoading,
  onSelectExpense,
  onResetFilters,
}: ExpenseTableProps) {
  if (isLoading) {
    return (
      <div className="p-4 rounded-lg bg-white border border-[#e6e6e1]">
        <TableSkeleton rows={6} cols={6} />
      </div>
    );
  }

  if (expenses.length === 0) {
    return (
      <div className="rounded-lg bg-white border border-[#e6e6e1] p-6">
        <EmptyState
          icon={<Receipt className="w-4 h-4" />}
          title="Tidak ada transaksi pengeluaran"
          description="Belum ada transaksi yang sesuai dengan filter pencarian atau rentang tanggal yang dipilih."
          actionLabel={onResetFilters ? 'Reset Filter' : undefined}
          onAction={onResetFilters}
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white border border-[#e6e6e1] overflow-hidden">
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#e6e6e1] bg-[#fafaf7] text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
              <th className="py-2.5 px-3.5">Tanggal</th>
              <th className="py-2.5 px-3.5">Merchant / Toko</th>
              <th className="py-2.5 px-3.5">Kategori</th>
              <th className="py-2.5 px-3.5">Nominal (IDR)</th>
              <th className="py-2.5 px-3.5">Dicatat Oleh</th>
              <th className="py-2.5 px-3.5">Status</th>
              <th className="py-2.5 px-3.5 text-right">Rincian</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0eb]">
            {expenses.map((exp) => (
              <tr
                key={exp.id}
                onClick={() => onSelectExpense(exp.id)}
                className="hover:bg-[#faf9f6] transition-colors cursor-pointer group"
              >
                <td className="py-2.5 px-3.5 whitespace-nowrap text-zinc-500 font-medium">
                  {formatDate(exp.transactionDate)}
                </td>
                <td className="py-2.5 px-3.5 font-semibold text-zinc-900">
                  <span className="truncate max-w-[220px] block">{exp.merchant}</span>
                </td>
                <td className="py-2.5 px-3.5 text-zinc-600">
                  <span className="px-1.5 py-0.2 rounded bg-zinc-100 text-[10px] font-medium border border-zinc-200 text-zinc-700">
                    {exp.category?.name || 'Tanpa Kategori'}
                  </span>
                </td>
                <td className="py-2.5 px-3.5 font-bold text-zinc-950 whitespace-nowrap">
                  {formatIDR(exp.amount)}
                </td>
                <td className="py-2.5 px-3.5 text-zinc-600 whitespace-nowrap">
                  <span>{exp.staff.name}</span>
                </td>
                <td className="py-2.5 px-3.5 whitespace-nowrap">
                  <ExpenseStatusBadge status={exp.status} />
                </td>
                <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                  <span className="text-[11px] font-medium text-[#047857] group-hover:underline inline-flex items-center gap-0.5">
                    Lihat
                    <ArrowUpRight className="w-3 h-3" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="md:hidden divide-y divide-[#f0f0eb]">
        {expenses.map((exp) => (
          <div
            key={exp.id}
            onClick={() => onSelectExpense(exp.id)}
            className="p-3.5 hover:bg-[#fafaf7] transition-colors cursor-pointer space-y-1.5"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-zinc-900">{exp.merchant}</span>
                <div className="text-[10px] text-zinc-400 mt-0.5">
                  <span>{formatDate(exp.transactionDate)}</span>
                  <span> · </span>
                  <span>{exp.staff.name}</span>
                </div>
              </div>
              <span className="text-xs font-bold text-zinc-950">{formatIDR(exp.amount)}</span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-zinc-600 font-medium px-1.5 py-0.2 rounded bg-zinc-100 border border-zinc-200">
                {exp.category?.name || 'Tanpa Kategori'}
              </span>
              <ExpenseStatusBadge status={exp.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

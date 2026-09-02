import React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { ExpenseStatusBadge } from '../expenses/ExpenseStatusBadge';
import { formatIDR, formatDate } from '@/lib/client/format';
import { ArrowRight, Clock, ArrowUpRight } from 'lucide-react';

export interface RecentExpenseItem {
  id: string;
  merchant: string;
  amount: number | string | { toString(): string };
  transactionDate: string | Date;
  status: string;
  staff?: { name: string };
  category?: { name: string } | null;
}

export function RecentExpenses({
  expenses,
  onSelectExpense,
}: {
  expenses: RecentExpenseItem[];
  onSelectExpense: (id: string) => void;
}) {
  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between py-3.5 px-4.5 sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#065f46]" />
            <CardTitle>Aktivitas Transaksi Terbaru</CardTitle>
          </div>
          <CardDescription>Transaksi terakhir yang tercatat di sistem</CardDescription>
        </div>
        <Link
          href="/expenses"
          className="text-xs font-semibold text-[#065f46] hover:text-[#047857] inline-flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200"
        >
          <span>Lihat Semua</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </CardHeader>

      <CardContent className="p-0">
        {expenses.length === 0 ? (
          <div className="py-10 text-center text-xs text-zinc-400">
            <p className="font-medium text-zinc-600">Belum ada transaksi tercatat</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">Kirim struk via WhatsApp bot untuk mulai mencatat transaksi.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f0f0eb]">
            {expenses.map((exp) => (
              <div
                key={exp.id}
                onClick={() => onSelectExpense(exp.id)}
                className="flex items-center justify-between p-3.5 px-4.5 sm:px-6 hover:bg-[#fafaf7] transition-colors cursor-pointer group"
              >
                <div className="min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-bold text-zinc-900 truncate">
                      {exp.merchant}
                    </span>
                    <span className="text-[10px] text-[#065f46] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 border border-emerald-200 shrink-0">
                      {exp.category?.name || 'Tanpa Kategori'}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    <span>{formatDate(exp.transactionDate)}</span>
                    {exp.staff && <span> · {exp.staff.name}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-right shrink-0">
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-zinc-950">
                      {formatIDR(exp.amount)}
                    </div>
                    <div className="mt-0.5">
                      <ExpenseStatusBadge status={exp.status} />
                    </div>
                  </div>

                  <span className="text-xs font-semibold text-[#065f46] group-hover:underline hidden sm:inline-flex items-center gap-0.5">
                    Lihat
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

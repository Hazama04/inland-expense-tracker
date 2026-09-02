import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { formatIDR } from '@/lib/client/format';
import { TrendingUp, BarChart2 } from 'lucide-react';

export interface TrendItem {
  date: string;
  label: string;
  amount: number;
  count: number;
}

export function TrendChart({ data }: { data: TrendItem[] }) {
  const maxAmount = Math.max(...data.map((d) => d.amount), 100000);
  const totalAmount = data.reduce((acc, curr) => acc + curr.amount, 0);

  if (totalAmount === 0 && data.every((d) => d.amount === 0)) {
    return (
      <Card className="h-full">
        <CardHeader className="py-3 px-4.5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#065f46]" />
            <CardTitle>Aktivitas Pengeluaran Harian</CardTitle>
          </div>
          <CardDescription>Tren pengeluaran harian 14 hari terakhir</CardDescription>
        </CardHeader>
        <CardContent className="p-4.5">
          <div className="h-36 flex flex-col items-center justify-center text-center text-zinc-400">
            <BarChart2 className="w-6 h-6 text-zinc-300 mb-1" />
            <p className="text-xs font-semibold text-zinc-700">Belum ada pengeluaran 14 hari terakhir</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">Grafik akan terisi otomatis saat transaksi masuk.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="py-3 px-4.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#065f46]" />
              <CardTitle>Aktivitas Pengeluaran Harian</CardTitle>
            </div>
            <CardDescription>Tren transaksi selama 14 hari terakhir</CardDescription>
          </div>
          <span className="text-[11px] font-bold text-[#065f46] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            14 Hari
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-4.5">
        <div className="h-36 flex items-end justify-between gap-1.5 sm:gap-2 pt-1 relative">
          {/* Subtle reference gridline */}
          <div className="absolute inset-x-0 top-4 border-t border-dashed border-zinc-100 pointer-events-none" />
          <div className="absolute inset-x-0 top-18 border-t border-dashed border-zinc-100 pointer-events-none" />

          {data.map((item, i) => {
            const heightPercent = item.amount > 0 ? Math.max(Math.round((item.amount / maxAmount) * 100), 8) : 3;
            const hasExpense = item.amount > 0;

            return (
              <div key={item.date || i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative z-10">
                {/* Tooltip on hover */}
                <div className="absolute -top-9 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-white text-[10px] px-2 py-0.5 rounded shadow-md pointer-events-none whitespace-nowrap z-30">
                  <span className="font-semibold">{item.label}: </span>
                  <span className="text-emerald-300 font-bold">{formatIDR(item.amount)}</span>
                </div>

                {/* Bar */}
                <div className="w-full bg-zinc-100 rounded-t flex items-end overflow-hidden h-full max-h-28">
                  <div
                    className={`w-full rounded-t transition-all duration-100 ${
                      hasExpense
                        ? 'bg-[#065f46] group-hover:bg-[#047857]'
                        : 'bg-transparent'
                    }`}
                    style={{ height: `${heightPercent}%` }}
                  />
                </div>

                {/* X-axis Label */}
                <span className="text-[10px] text-zinc-400 font-medium truncate w-full text-center">
                  {i % 2 === 0 ? item.label.split(' ')[0] : ''}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { formatIDR } from '@/lib/client/format';
import { PieChart } from 'lucide-react';

export interface CategoryData {
  id: string;
  name: string;
  amount: number;
  count: number;
  percentage: number;
}

export function CategoryChart({ categories }: { categories: CategoryData[] }) {
  if (!categories || categories.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader className="py-3 px-4.5">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-[#065f46]" />
            <CardTitle>Distribusi Alokasi Kategori</CardTitle>
          </div>
          <CardDescription>Breakdown pengeluaran berdasarkan kategori</CardDescription>
        </CardHeader>
        <CardContent className="p-4.5">
          <div className="h-36 flex flex-col items-center justify-center text-center text-zinc-400">
            <p className="text-xs font-semibold text-zinc-700">Belum ada alokasi kategori</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">Kategori pengeluaran akan terdaftar otomatis.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="py-3 px-4.5">
        <div className="flex items-center gap-2">
          <PieChart className="w-4 h-4 text-[#065f46]" />
          <CardTitle>Distribusi Alokasi Kategori</CardTitle>
        </div>
        <CardDescription>Peringkat alokasi anggaran per kategori</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-[#f0f0eb] max-h-44 overflow-y-auto">
          {categories.slice(0, 4).map((cat, idx) => {
            const isTop = idx === 0;
            return (
              <div key={cat.id || idx} className="p-3 px-4.5 hover:bg-[#fafaf7] transition-colors">
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[9px] font-bold w-4 h-4 rounded flex items-center justify-center ${
                        isTop ? 'bg-[#065f46] text-white' : 'bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className={`font-semibold ${isTop ? 'text-[#065f46]' : 'text-zinc-900'}`}>
                      {cat.name}
                    </span>
                    <span className="text-[10px] text-zinc-400">({cat.count} trx)</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-zinc-900">{formatIDR(cat.amount)}</span>
                    <span className={`ml-2 font-bold text-[11px] ${isTop ? 'text-[#065f46]' : 'text-zinc-500'}`}>
                      {cat.percentage}%
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-1 rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${isTop ? 'bg-[#065f46]' : 'bg-zinc-400'}`}
                    style={{ width: `${cat.percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

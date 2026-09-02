import React from 'react';
import { formatIDR } from '@/lib/client/format';
import { Wallet, Calendar, AlertCircle, Sparkles } from 'lucide-react';

export interface KpiData {
  monthTotal: number;
  monthCount: number;
  todayTotal: number;
  todayCount: number;
  needsReviewCount: number;
  autoRate: number;
}

export function KpiCards({ data }: { data: KpiData }) {
  return (
    <div className="space-y-4">
      {/* 1. Refined Emerald Hero Section (Height ~140-160px) */}
      <div className="rounded-lg bg-[#065f46] text-white px-6 py-5 sm:px-7 sm:py-6 border border-[#047857] shadow-xs relative overflow-hidden flex flex-col justify-between min-h-[140px]">
        {/* Subtle geometric angle background */}
        <div className="absolute right-0 top-0 bottom-0 w-1/4 bg-gradient-to-l from-[#047857]/30 to-transparent pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-emerald-200 font-bold uppercase tracking-wider text-[11px]">
              <Wallet className="w-3.5 h-3.5 text-emerald-300" />
              <span>Pengeluaran Bulan Ini</span>
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold text-white mt-1.5 tracking-tight">
              {formatIDR(data.monthTotal)}
            </div>
            <div className="text-xs text-emerald-100/90 font-medium mt-1">
              {data.monthCount} transaksi tercatat pada periode berjalan
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <span className="text-[11px] font-semibold bg-[#047857] text-emerald-100 px-3 py-1.5 rounded border border-emerald-500/40 whitespace-nowrap">
              Periode Aktif
            </span>
          </div>
        </div>
      </div>

      {/* 2. Unified Financial Reporting Strip (Single White Surface with Vertical Dividers) */}
      <div className="bg-white rounded-lg border border-[#e6e6e1] shadow-2xs overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#e6e6e1]">
          {/* Strip Metric 1: Pengeluaran Hari Ini */}
          <div className="p-4 sm:px-5 sm:py-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Pengeluaran Hari Ini
              </span>
              <div className="text-xl font-bold text-zinc-900 mt-0.5 tracking-tight">
                {formatIDR(data.todayTotal)}
              </div>
              <span className="text-[11px] text-zinc-500 mt-0.5 block">
                {data.todayCount} transaksi hari ini
              </span>
            </div>
            <div className="w-8 h-8 rounded bg-zinc-100 text-zinc-500 flex items-center justify-center border border-zinc-200 shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
          </div>

          {/* Strip Metric 2: Perlu Review */}
          <div className={`p-4 sm:px-5 sm:py-4 flex items-center justify-between ${data.needsReviewCount > 0 ? 'bg-[#fffdfa]' : ''}`}>
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Perlu Review
              </span>
              <div className={`text-xl font-bold mt-0.5 tracking-tight ${data.needsReviewCount > 0 ? 'text-[#b45309]' : 'text-zinc-900'}`}>
                {data.needsReviewCount} Struk
              </div>
              <span className="text-[11px] text-zinc-500 mt-0.5 block">
                {data.needsReviewCount > 0 ? 'Memerlukan verifikasi finance' : 'Semua terverifikasi'}
              </span>
            </div>
            <div className={`w-8 h-8 rounded flex items-center justify-center border shrink-0 ${data.needsReviewCount > 0 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-zinc-100 text-zinc-500 border-zinc-200'}`}>
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>

          {/* Strip Metric 3: Auto OCR Gemini */}
          <div className="p-4 sm:px-5 sm:py-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Auto OCR Gemini
              </span>
              <div className="text-xl font-bold text-zinc-900 mt-0.5 tracking-tight">
                {data.monthCount > 0 && data.autoRate > 0 ? `${data.autoRate}%` : '—'}
              </div>
              <span className="text-[11px] text-zinc-500 mt-0.5 block">
                {data.monthCount > 0 && data.autoRate > 0 ? 'Tingkat akurasi ekstraksi' : 'Menunggu pipeline OCR'}
              </span>
            </div>
            <div className="w-8 h-8 rounded bg-emerald-50 text-[#065f46] flex items-center justify-center border border-emerald-200 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

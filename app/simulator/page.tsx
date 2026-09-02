'use client';

import React from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { MessageSquare, Sparkles } from 'lucide-react';

export default function SimulatorPage() {
  return (
    <AppShell>
      <div className="space-y-5">
        <div className="pb-3 border-b border-[#e6e6e1]">
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-950 tracking-tight">
            WhatsApp Simulator
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Lingkungan simulasi percakapan dan pengujian bot WhatsApp secara langsung
          </p>
        </div>

        <Card className="p-8 sm:p-12 text-center border-dashed">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-[#065f46] flex items-center justify-center mx-auto mb-3 border border-emerald-200">
            <MessageSquare className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-zinc-900">WhatsApp Interactive Simulator</h3>
          <p className="text-xs text-zinc-500 max-w-md mx-auto mt-1 mb-4 leading-relaxed">
            Fitur simulasi interaktif WhatsApp akan diaktifkan pada Fase implementasi berikutnya setelah pipeline receipt OCR dan background worker terintegrasi.
          </p>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#065f46] bg-emerald-50 px-3 py-1 rounded-md border border-emerald-200">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Fase 2 Integrasi</span>
          </span>
        </Card>
      </div>
    </AppShell>
  );
}

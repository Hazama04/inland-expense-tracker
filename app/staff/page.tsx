'use client';

import React from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { Users, Shield } from 'lucide-react';

export default function StaffPage() {
  return (
    <AppShell>
      <div className="space-y-5">
        <div className="pb-3 border-b border-[#e6e6e1]">
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-950 tracking-tight">
            Daftar Staf & Whitelist
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Manajemen staf terdaftar dan otorisasi nomor WhatsApp kantor
          </p>
        </div>

        <Card className="p-8 sm:p-12 text-center border-dashed">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-[#065f46] flex items-center justify-center mx-auto mb-3 border border-emerald-200">
            <Users className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-zinc-900">Manajemen Staf & Whitelist</h3>
          <p className="text-xs text-zinc-500 max-w-md mx-auto mt-1 mb-4 leading-relaxed">
            API backend whitelist staf telah aktif. Antarmuka tabel CRUD staf lengkap akan dibuka pada fase manajemen admin.
          </p>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#065f46] bg-emerald-50 px-3 py-1 rounded-md border border-emerald-200">
            <Shield className="w-3.5 h-3.5" />
            <span>Khusus Admin & Finance</span>
          </span>
        </Card>
      </div>
    </AppShell>
  );
}

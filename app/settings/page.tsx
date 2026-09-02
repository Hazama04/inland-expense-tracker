'use client';

import React from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { Database, Cloud, Smartphone } from 'lucide-react';

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="space-y-5">
        <div className="pb-3 border-b border-[#e6e6e1]">
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-950 tracking-tight">
            Pengaturan & Status Sistem
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Status infrastruktur cloud, database PostgreSQL, dan integrasi WhatsApp
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-[#065f46] flex items-center justify-center border border-emerald-200">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-900">Neon PostgreSQL</h4>
                <span className="text-[11px] text-[#065f46] font-bold">Terhubung (Prisma 7)</span>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200">
                <Cloud className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-900">Vercel Blob Storage</h4>
                <span className="text-[11px] text-blue-700 font-bold">Store: SIN1 (Private)</span>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-900">Fonnte WhatsApp</h4>
                <span className="text-[11px] text-purple-700 font-bold">Webhook Aktif</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

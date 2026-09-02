'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { KpiCards } from '@/components/dashboard/KpiCards';
import { CategoryChart } from '@/components/dashboard/CategoryChart';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { RecentExpenses } from '@/components/dashboard/RecentExpenses';
import { NeedsReviewBanner } from '@/components/dashboard/NeedsReviewBanner';
import { ExpenseDetailModal } from '@/components/expenses/ExpenseDetailModal';
import { apiClient, DashboardStatsData, CategoryItem } from '@/lib/client/api';
import { Skeleton } from '@/components/ui/Skeleton';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStatsData | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    const [statsRes, catRes] = await Promise.all([
      apiClient.getDashboardStats(),
      apiClient.getCategories(),
    ]);

    if (statsRes.data) {
      setStats(statsRes.data);
    }
    if (catRes.data) {
      setCategories(catRes.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let ignore = false;
    Promise.all([apiClient.getDashboardStats(), apiClient.getCategories()]).then(
      ([statsRes, catRes]) => {
        if (!ignore) {
          if (statsRes.data) setStats(statsRes.data);
          if (catRes.data) setCategories(catRes.data);
          setLoading(false);
        }
      }
    );
    return () => {
      ignore = true;
    };
  }, []);

  const todayFormatted = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <AppShell>
      {/* 1. Page Header (Horizontal, No Card Container) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#e6e6e1]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-950 tracking-tight">
            Dashboard Operasional Keuangan
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5 font-medium">
            <span>{todayFormatted}</span>
            <span className="mx-1.5 text-zinc-300">·</span>
            <span>Inland Property Expense Management</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={loadDashboardData}
            leftIcon={<RefreshCw className="w-3.5 h-3.5 text-[#065f46]" />}
          >
            Segarkan Data
          </Button>
        </div>
      </div>

      {loading || !stats ? (
        <div className="space-y-4">
          <Skeleton className="h-36 w-full rounded-lg bg-emerald-950/20" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7">
              <Skeleton className="h-72 rounded-lg" />
            </div>
            <div className="lg:col-span-5">
              <Skeleton className="h-72 rounded-lg" />
            </div>
          </div>
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Needs Review Alert Banner (if any) */}
          <NeedsReviewBanner count={stats.kpi?.needsReviewCount || 0} />

          {/* 2. Emerald Hero (140-160px) + 3. Horizontal Secondary Reporting Strip */}
          <KpiCards data={stats.kpi} />

          {/* 4. Analytics Grid (7 cols / 5 cols, height ~280-320px) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Left: 14-day Daily Expense Trend */}
            <div className="lg:col-span-7">
              <TrendChart data={stats.dailyTrend || []} />
            </div>

            {/* Right: Ranked Category Allocation */}
            <div className="lg:col-span-5">
              <CategoryChart categories={stats.categories || []} />
            </div>
          </div>

          {/* 5. Full Width Recent Activity Transaction Ledger */}
          <div>
            <RecentExpenses
              expenses={stats.recentExpenses || []}
              onSelectExpense={(id) => setSelectedExpenseId(id)}
            />
          </div>
        </div>
      )}

      {/* Expense Detail Modal */}
      <ExpenseDetailModal
        expenseId={selectedExpenseId}
        onClose={() => setSelectedExpenseId(null)}
        onUpdated={loadDashboardData}
        categories={categories}
      />
    </AppShell>
  );
}

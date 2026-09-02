'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { ExpenseFilters, FilterState } from '@/components/expenses/ExpenseFilters';
import { ExpenseTable } from '@/components/expenses/ExpenseTable';
import { ExpensePagination } from '@/components/expenses/ExpensePagination';
import { ExpenseDetailModal } from '@/components/expenses/ExpenseDetailModal';
import { apiClient, CategoryItem } from '@/lib/client/api';
import { ExpenseWithRelations } from '@/repositories/expense.repository';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

function ExpensesContent() {
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<FilterState>({
    search: searchParams.get('search') || '',
    status: searchParams.get('status') || '',
    categoryId: searchParams.get('categoryId') || '',
    startDate: searchParams.get('startDate') || '',
    endDate: searchParams.get('endDate') || '',
  });

  const [page, setPage] = useState<number>(Number(searchParams.get('page')) || 1);
  const [pageSize] = useState<number>(10);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  const [expenses, setExpenses] = useState<ExpenseWithRelations[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.getExpenses({
      page,
      pageSize,
      search: filters.search || undefined,
      status: filters.status || undefined,
      categoryId: filters.categoryId || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
    });

    if (res.data) {
      setExpenses(res.data);
      if (res.meta) {
        setTotal(res.meta.total);
        setTotalPages(res.meta.totalPages);
      }
    }
    setLoading(false);
  }, [page, pageSize, filters]);

  useEffect(() => {
    let ignore = false;
    apiClient.getCategories().then((res) => {
      if (!ignore && res.data) {
        setCategories(res.data);
      }
    });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    apiClient
      .getExpenses({
        page,
        pageSize,
        search: filters.search || undefined,
        status: filters.status || undefined,
        categoryId: filters.categoryId || undefined,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
      })
      .then((res) => {
        if (!ignore) {
          if (res.data) {
            setExpenses(res.data);
            if (res.meta) {
              setTotal(res.meta.total);
              setTotalPages(res.meta.totalPages);
            }
          }
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [page, pageSize, filters]);

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      status: '',
      categoryId: '',
      startDate: '',
      endDate: '',
    });
    setPage(1);
  };

  return (
    <div className="space-y-5">
      {/* 1. Page Header (Horizontal, No Card Container) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#e6e6e1]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-950 tracking-tight">
            Pusat Pengeluaran & Transaksi
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5 font-medium">
            Daftar lengkap seluruh pencatatan transaksi struk WhatsApp & entri operasional kantor
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={loadExpenses}
            leftIcon={<RefreshCw className="w-3.5 h-3.5 text-[#065f46]" />}
          >
            Segarkan Data
          </Button>
        </div>
      </div>

      {/* 2. Filter Toolbar */}
      <ExpenseFilters
        filters={filters}
        onChange={handleFilterChange}
        categories={categories}
        onReset={handleResetFilters}
      />

      {/* 3. Full Width Expense Data Ledger Table */}
      <ExpenseTable
        expenses={expenses}
        isLoading={loading}
        onSelectExpense={(id) => setSelectedExpenseId(id)}
        onResetFilters={handleResetFilters}
      />

      {/* 4. Full Width Server Pagination */}
      <ExpensePagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onPageChange={(newPage) => setPage(newPage)}
      />

      {/* 5. Expense Detail Modal */}
      <ExpenseDetailModal
        expenseId={selectedExpenseId}
        onClose={() => setSelectedExpenseId(null)}
        onUpdated={loadExpenses}
        categories={categories}
      />
    </div>
  );
}

export default function ExpensesPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="py-12 text-center text-xs text-zinc-400">Memuat data pengeluaran...</div>}>
        <ExpensesContent />
      </Suspense>
    </AppShell>
  );
}

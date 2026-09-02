'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { ExpenseStatusBadge } from './ExpenseStatusBadge';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { formatIDR, formatDate, formatDateTime } from '@/lib/client/format';
import { apiClient } from '@/lib/client/api';
import { ExpenseWithRelations } from '@/repositories/expense.repository';
import { Lock, FileText, ArrowUpRight } from 'lucide-react';

export interface ExpenseDetailModalProps {
  expenseId: string | null;
  onClose: () => void;
  onUpdated: () => void;
  categories: Array<{ id: string; name: string }>;
  userRole?: string;
}

export function ExpenseDetailModal({
  expenseId,
  onClose,
  onUpdated,
  categories,
  userRole = 'STAFF',
}: ExpenseDetailModalProps) {
  const [expense, setExpense] = useState<ExpenseWithRelations | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit fields
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  useEffect(() => {
    let ignore = false;
    if (expenseId) {
      apiClient.getExpenseById(expenseId).then((res) => {
        if (!ignore) {
          if (res.data) {
            setExpense(res.data);
            setSelectedStatus(res.data.status);
            setSelectedCategory(res.data.categoryId || '');
          } else {
            setError(res.error?.message || 'Gagal memuat rincian transaksi');
          }
          setLoading(false);
        }
      });
    }
    return () => {
      ignore = true;
    };
  }, [expenseId]);

  const handleSave = async () => {
    if (!expenseId) return;
    setUpdating(true);
    setError(null);

    const updatePayload: Record<string, unknown> = {};
    if (selectedStatus !== expense?.status) {
      updatePayload.status = selectedStatus;
    }
    if (selectedCategory !== (expense?.categoryId || '')) {
      updatePayload.categoryId = selectedCategory || null;
    }

    if (Object.keys(updatePayload).length === 0) {
      onClose();
      return;
    }

    const res = await apiClient.updateExpense(expenseId, updatePayload);
    if (res.data) {
      onUpdated();
      onClose();
    } else {
      setError(res.error?.message || 'Gagal memperbarui status transaksi');
    }
    setUpdating(false);
  };

  const canEditStatus = userRole === 'ADMIN' || userRole === 'FINANCE';

  const statusOptions = [
    { value: 'AUTO', label: 'Auto OCR' },
    { value: 'DIKOREKSI_MANUAL', label: 'Dikoreksi Manual' },
    { value: 'INPUT_MANUAL', label: 'Input Manual' },
    { value: 'PERLU_REVIEW', label: 'Perlu Review' },
  ];

  const categoryOptions = [
    { value: '', label: 'Tanpa Kategori' },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <Modal
      isOpen={Boolean(expenseId)}
      onClose={onClose}
      title="Rincian Transaksi Pengeluaran"
      description={`ID Referensi: ${expenseId || ''}`}
      maxWidth="lg"
    >
      {loading ? (
        <div className="py-10 text-center text-xs text-zinc-400">Memuat rincian transaksi...</div>
      ) : expense ? (
        <div className="space-y-4">
          {error && (
            <div className="p-2.5 rounded bg-rose-50 text-rose-700 text-xs border border-rose-200">
              {error}
            </div>
          )}

          {/* Primary Amount Section */}
          <div className="p-3.5 rounded-md bg-[#fafaf7] border border-[#e6e6e1] flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Total Nominal
              </span>
              <div className="text-xl font-bold text-zinc-950 mt-0.5 tracking-tight">
                {formatIDR(expense.amount)}
              </div>
            </div>
            <ExpenseStatusBadge status={expense.status} />
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded bg-[#fafaf7] border border-[#e6e6e1] space-y-0.5">
              <span className="text-[10px] font-medium text-zinc-400 block">Nama Merchant / Toko</span>
              <span className="font-semibold text-zinc-900 block truncate">{expense.merchant}</span>
            </div>

            <div className="p-2.5 rounded bg-[#fafaf7] border border-[#e6e6e1] space-y-0.5">
              <span className="text-[10px] font-medium text-zinc-400 block">Tanggal Transaksi</span>
              <span className="font-semibold text-zinc-900 block">{formatDate(expense.transactionDate)}</span>
            </div>

            <div className="p-2.5 rounded bg-[#fafaf7] border border-[#e6e6e1] space-y-0.5">
              <span className="text-[10px] font-medium text-zinc-400 block">Dicatat Oleh (Staf)</span>
              <span className="font-semibold text-zinc-900 block">{expense.staff?.name} ({expense.staff?.phoneNumber})</span>
            </div>

            <div className="p-2.5 rounded bg-[#fafaf7] border border-[#e6e6e1] space-y-0.5">
              <span className="text-[10px] font-medium text-zinc-400 block">Waktu Input Sistem</span>
              <span className="font-semibold text-zinc-900 block">{formatDateTime(expense.createdAt)}</span>
            </div>
          </div>

          {/* Notes */}
          {expense.notes && (
            <div className="p-2.5 rounded bg-[#fafaf7] border border-[#e6e6e1] space-y-0.5">
              <span className="text-[10px] font-medium text-zinc-400 block">Catatan Struk</span>
              <p className="text-xs text-zinc-700">{expense.notes}</p>
            </div>
          )}

          {/* Receipt Image Display */}
          {expense.receiptImagePath ? (
            <div className="p-3 rounded-md bg-[#fafaf7] border border-[#e6e6e1] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
                  <FileText className="w-3.5 h-3.5 text-[#065f46]" />
                  <span>Bukti Foto Struk Asli</span>
                </div>
                {expense.confidenceScore && (
                  <span className="text-[10px] font-bold text-[#065f46] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Akurasi OCR: {Math.round(parseFloat(expense.confidenceScore.toString()) * 100)}%
                  </span>
                )}
              </div>

              <div className="relative rounded border border-[#e6e6e1] overflow-hidden bg-zinc-100 max-h-48 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/expenses/${expense.id}/receipt`}
                  alt={`Struk ${expense.merchant}`}
                  className="w-full h-48 object-contain bg-zinc-900/5"
                  loading="lazy"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
                <span className="flex items-center gap-1">
                  <Lock className="w-3 h-3 text-[#065f46]" />
                  Vercel Blob Private (SIN1)
                </span>
                <a
                  href={`/api/expenses/${expense.id}/receipt`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[#065f46] hover:underline inline-flex items-center gap-0.5"
                >
                  Buka Gambar Penuh
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </div>
            </div>
          ) : (
            <div className="p-2.5 rounded border border-[#e6e6e1] bg-white flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <FileText className="w-3.5 h-3.5 text-zinc-400" />
                <span>Tidak ada foto struk (transaksi input manual)</span>
              </div>
              <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-100 px-1.5 py-0.2 rounded border border-zinc-200">
                Input Manual
              </span>
            </div>
          )}

          {/* Finance Review Override */}
          {canEditStatus && (
            <div className="p-3 rounded-md bg-[#fafaf7] border border-[#e6e6e1] space-y-2.5">
              <span className="text-xs font-semibold text-zinc-800 block">
                Verifikasi Status & Kategori (Finance / Admin)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Select
                  label="Status Transaksi"
                  options={statusOptions}
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                />
                <Select
                  label="Kategori Alokasi"
                  options={categoryOptions}
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#f0f0eb]">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Tutup
            </Button>
            {canEditStatus && (
              <Button size="sm" onClick={handleSave} isLoading={updating}>
                Simpan Perubahan
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

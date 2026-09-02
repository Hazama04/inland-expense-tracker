'use client';

import React from 'react';
import { Search, RotateCcw } from 'lucide-react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';

export interface FilterState {
  search: string;
  status: string;
  categoryId: string;
  startDate: string;
  endDate: string;
}

export interface ExpenseFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  categories: Array<{ id: string; name: string }>;
  onReset: () => void;
}

export function ExpenseFilters({
  filters,
  onChange,
  categories,
  onReset,
}: ExpenseFiltersProps) {
  const statusOptions = [
    { value: '', label: 'Semua Status' },
    { value: 'AUTO', label: 'Auto OCR' },
    { value: 'DIKOREKSI_MANUAL', label: 'Dikoreksi Manual' },
    { value: 'INPUT_MANUAL', label: 'Input Manual' },
    { value: 'PERLU_REVIEW', label: 'Perlu Review' },
  ];

  const categoryOptions = [
    { value: '', label: 'Semua Kategori' },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  const hasActiveFilters =
    Boolean(filters.search) ||
    Boolean(filters.status) ||
    Boolean(filters.categoryId) ||
    Boolean(filters.startDate) ||
    Boolean(filters.endDate);

  return (
    <div className="bg-white border border-[#e6e6e1] rounded-lg p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center">
        {/* Search Input */}
        <div className="lg:col-span-5">
          <Input
            placeholder="Cari nama merchant, catatan..."
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            leftIcon={<Search className="w-3.5 h-3.5" />}
          />
        </div>

        {/* Status Dropdown */}
        <div className="lg:col-span-3">
          <Select
            options={statusOptions}
            value={filters.status}
            onChange={(e) => onChange({ ...filters, status: e.target.value })}
          />
        </div>

        {/* Category Dropdown */}
        <div className="lg:col-span-3">
          <Select
            options={categoryOptions}
            value={filters.categoryId}
            onChange={(e) => onChange({ ...filters, categoryId: e.target.value })}
          />
        </div>

        {/* Reset Action */}
        <div className="lg:col-span-1 flex items-center justify-end">
          {hasActiveFilters && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onReset}
              leftIcon={<RotateCcw className="w-3 h-3" />}
              className="w-full sm:w-auto text-xs"
              title="Reset Filter"
            >
              Reset
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

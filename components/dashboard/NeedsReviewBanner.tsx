import React from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';

export function NeedsReviewBanner({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 rounded-lg bg-[#fffbeb] border border-[#fde68a] text-[#92400e] gap-3">
      <div className="flex items-center gap-2.5">
        <AlertCircle className="w-4 h-4 text-[#b45309] shrink-0" />
        <div className="text-xs">
          <span className="font-semibold text-zinc-900">Perhatian: </span>
          <span>Terdapat <strong>{count} transaksi</strong> yang memerlukan verifikasi manual finance sebelum disinkronkan.</span>
        </div>
      </div>

      <Link href="/expenses?status=PERLU_REVIEW">
        <Button size="sm" variant="warning" rightIcon={<ArrowRight className="w-3 h-3" />}>
          Periksa Review
        </Button>
      </Link>
    </div>
  );
}

import { Prisma, ExpenseStatus } from '@/app/generated/prisma/client';
import { RawOcrExtractResult } from './gemini';

export interface NormalizedOcrResult {
  merchant: string;
  amount: Prisma.Decimal;
  transactionDate: Date;
  categoryId: string | null;
  confidenceScore: Prisma.Decimal;
  status: ExpenseStatus;
  notes: string | null;
  reviewReasons: string[];
}

const INDONESIAN_MONTHS: Record<string, number> = {
  januari: 0,
  jan: 0,
  februari: 1,
  feb: 1,
  maret: 2,
  mar: 2,
  april: 3,
  apr: 3,
  mei: 4,
  may: 4,
  juni: 5,
  jun: 5,
  juli: 6,
  jul: 6,
  agustus: 7,
  agt: 7,
  agu: 7,
  september: 8,
  sep: 8,
  oktober: 9,
  okt: 9,
  oct: 9,
  november: 10,
  nov: 10,
  desember: 11,
  des: 11,
  dec: 11,
};

/**
 * Normalizes Indonesian currency string or number to a positive integer/decimal number.
 * e.g. "Rp 120.000" -> 120000, "1.250.000,00" -> 1250000, "45000" -> 45000
 */
export function normalizeOcrAmount(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return raw > 0 ? Math.round(raw) : null;
  }

  const str = raw.trim();
  if (!str || str.startsWith('-')) return null;

  // Strip prefix "Rp", "rp", "IDR", etc.
  let cleaned = str.replace(/^(rp\.?|idr)\s*/i, '').trim();

  // If format is like "1.250.000,00" or "120.000,50" (Indonesian standard: dot for thousand, comma for decimal)
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.split(',')[0].replace(/\./g, '');
  } else if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(cleaned)) {
    // US standard format "1,250,000.00"
    cleaned = cleaned.split('.')[0].replace(/,/g, '');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    // Indonesian thousand dot only "120.000"
    cleaned = cleaned.replace(/\./g, '');
  } else if (/^\d{1,3}(,\d{3})+$/.test(cleaned)) {
    // US thousand comma only "120,000"
    cleaned = cleaned.replace(/,/g, '');
  } else {
    // Extract digits only if simple integer
    cleaned = cleaned.replace(/[^\d]/g, '');
  }

  const num = parseInt(cleaned, 10);
  return !isNaN(num) && num > 0 ? num : null;
}

/**
 * Normalizes date string into canonical Date object in UTC calendar representation.
 */
export function normalizeOcrDate(raw: string | null | undefined): Date {
  const now = new Date();
  const fallbackToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!raw) return fallbackToday;

  const str = raw.trim().toLowerCase();

  // 1. Standard ISO format: YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const d = new Date(Date.UTC(year, month, day));
    if (isValidTransactionDate(d, now)) return d;
  }

  // 2. Indonesian DD/MM/YYYY or DD-MM-YYYY
  const slashMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10) - 1;
    const year = parseInt(slashMatch[3], 10);
    const d = new Date(Date.UTC(year, month, day));
    if (isValidTransactionDate(d, now)) return d;
  }

  // 3. Textual Indonesian month: "1 September 2026", "15-Agu-2026", "12 Oct 2026"
  const textMonthMatch = str.match(/(\d{1,2})\s*[-/ ]\s*([a-z]+)\s*[-/ ]\s*(\d{4})/);
  if (textMonthMatch) {
    const day = parseInt(textMonthMatch[1], 10);
    const monthStr = textMonthMatch[2];
    const year = parseInt(textMonthMatch[3], 10);

    const monthIndex = INDONESIAN_MONTHS[monthStr];
    if (monthIndex !== undefined) {
      const d = new Date(Date.UTC(year, monthIndex, day));
      if (isValidTransactionDate(d, now)) return d;
    }
  }

  // Fallback to today UTC if date could not be determined
  return fallbackToday;
}

function isValidTransactionDate(d: Date, now: Date): boolean {
  if (isNaN(d.getTime())) return false;
  // Cannot be > 1 day in the future (compared in UTC)
  const oneDayAhead = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 23, 59, 59, 999));
  if (d.getTime() > oneDayAhead.getTime()) return false;
  // Cannot be older than 3 years
  const threeYearsAgo = new Date(Date.UTC(now.getUTCFullYear() - 3, now.getUTCMonth(), now.getUTCDate()));
  if (d.getTime() < threeYearsAgo.getTime()) return false;
  return true;
}

/**
 * Resolves a category ID from candidate name and keywords against the active categories.
 */
export function resolveCategory(
  candidate: string | null | undefined,
  merchant: string,
  categories: Array<{ id: string; name: string; keywords: string[] }>
): string | null {
  if (!categories.length) return null;

  const candidateLower = (candidate || '').toLowerCase().trim();
  const merchantLower = merchant.toLowerCase().trim();

  // 1. Direct name match
  for (const cat of categories) {
    const catNameLower = cat.name.toLowerCase();
    if (catNameLower === candidateLower) {
      return cat.id;
    }
  }

  // 2. Keyword match on categoryCandidate or merchant
  for (const cat of categories) {
    const allKeywords = [cat.name.toLowerCase(), ...cat.keywords.map((k) => k.toLowerCase())];
    for (const kw of allKeywords) {
      if (candidateLower.includes(kw) || merchantLower.includes(kw)) {
        return cat.id;
      }
    }
  }

  return null;
}

/**
 * Normalizes raw OCR output into validated domain fields with status and review triggers.
 */
export function normalizeOcrResult(
  ocr: RawOcrExtractResult,
  activeCategories: Array<{ id: string; name: string; keywords: string[] }>
): NormalizedOcrResult {
  const reviewReasons: string[] = [];

  // 1. Merchant
  let merchant = (ocr.merchant || '').trim();
  if (!merchant || merchant.length < 2) {
    merchant = 'Merchant Tidak Terbaca';
    reviewReasons.push('Nama merchant tidak terbaca dengan jelas');
  }

  // 2. Amount
  const parsedAmount = normalizeOcrAmount(ocr.amount);
  let amountDecimal: Prisma.Decimal;
  if (!parsedAmount || parsedAmount <= 0) {
    amountDecimal = new Prisma.Decimal(0);
    reviewReasons.push('Nominal pembayaran tidak valid atau 0');
  } else {
    amountDecimal = new Prisma.Decimal(parsedAmount);
  }

  // 3. Date
  const transactionDate = normalizeOcrDate(ocr.transactionDate);

  // 4. Category
  const categoryId = resolveCategory(ocr.categoryCandidate, merchant, activeCategories);
  if (!categoryId) {
    reviewReasons.push('Kategori belum terklasifikasi otomatis');
  }

  // 5. Confidence
  const rawConfidence = typeof ocr.confidenceScore === 'number' ? ocr.confidenceScore : 0.8;
  const clampedConfidence = Math.max(0, Math.min(1, rawConfidence));
  const confidenceScore = new Prisma.Decimal(clampedConfidence.toFixed(4));

  if (clampedConfidence < 0.75) {
    reviewReasons.push(`Akurasi OCR rendah (${Math.round(clampedConfidence * 100)}%)`);
  }

  // 6. Status determination
  const isAuto =
    reviewReasons.length === 0 &&
    parsedAmount !== null &&
    parsedAmount > 0 &&
    merchant !== 'Merchant Tidak Terbaca' &&
    clampedConfidence >= 0.75;

  const status = isAuto ? ExpenseStatus.AUTO : ExpenseStatus.PERLU_REVIEW;

  return {
    merchant,
    amount: amountDecimal,
    transactionDate,
    categoryId,
    confidenceScore,
    status,
    notes: ocr.notes?.trim() || null,
    reviewReasons,
  };
}

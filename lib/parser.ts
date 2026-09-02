export type ParsedCommand =
  | { type: 'IMAGE'; mediaUrl: string; caption?: string }
  | { type: 'HELP' }
  | { type: 'HISTORY' }
  | { type: 'MONTH_TOTAL' }
  | { type: 'CATEGORY_CORRECTION'; category: string }
  | { type: 'AMOUNT_CORRECTION'; amount: number }
  | { type: 'NOTE_CORRECTION'; note: string }
  | { type: 'MANUAL_EXPENSE'; merchant: string; amount: number; category: string }
  | { type: 'UNRECOGNIZED'; rawText: string };

/**
 * Parses numeric monetary string into a clean number.
 * Handles: "145000", "145.000", "Rp 145.000", "Rp145,000"
 */
export function parseCurrencyAmount(raw: string): number | null {
  if (!raw || typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  // Check for negative sign
  if (trimmed.startsWith('-')) {
    return null;
  }

  // Remove "Rp" prefix (case insensitive)
  let cleaned = trimmed.replace(/^rp\.?\s*/i, '').trim();

  // If format is like "50.000,00" or "1.250.000,50" (Indonesian format with cents)
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }
  // If format is like "145.000" or "1.250.000" (dot as thousand separator, no cents)
  else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '');
  }
  // If format is like "145,000" or "1,250,000" (comma as thousand separator)
  else if (/^\d{1,3}(,\d{3})+$/.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, '');
  }
  // If format is like "145000,50"
  else if (/^\d+,\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(',', '.');
  }

  // Extract valid numeric part
  const num = parseFloat(cleaned);
  return !isNaN(num) && num > 0 && isFinite(num) ? num : null;
}

/**
 * Pure functional parser that classifies incoming WhatsApp message payloads.
 */
export function parseWhatsAppMessage(params: {
  message?: string | null;
  mediaUrl?: string | null;
}): ParsedCommand {
  const rawMedia = params.mediaUrl?.trim();
  const rawText = (params.message || '').trim();

  // 1. Image detection
  if (rawMedia) {
    return {
      type: 'IMAGE',
      mediaUrl: rawMedia,
      caption: rawText || undefined,
    };
  }

  if (!rawText) {
    return { type: 'UNRECOGNIZED', rawText: '' };
  }

  const lower = rawText.toLowerCase();

  // 2. Help / Onboarding
  if (lower === 'help' || lower === 'bantuan' || lower === '?' || lower === 'menu' || lower === 'halo' || lower === 'hai') {
    return { type: 'HELP' };
  }

  // 3. History
  if (lower === 'riwayat' || lower === 'history') {
    return { type: 'HISTORY' };
  }

  // 4. Month Total
  if (lower === 'total bulan ini' || lower === 'total bulan' || lower === 'total' || lower === 'rekap bulan ini') {
    return { type: 'MONTH_TOTAL' };
  }

  // 5. Manual Expense: "manual: merchant | amount | category"
  const manualMatch = rawText.match(/^manual\s*:\s*(.+)$/i);
  if (manualMatch) {
    const parts = manualMatch[1].split('|').map((p) => p.trim());
    if (parts.length >= 3) {
      const merchant = parts[0];
      const amount = parseCurrencyAmount(parts[1]);
      const category = parts[2];

      if (merchant && amount && category) {
        return {
          type: 'MANUAL_EXPENSE',
          merchant,
          amount,
          category,
        };
      }
    }
  }

  // 6. Category Correction: "kategori: <category>"
  const categoryMatch = rawText.match(/^kategori\s*:\s*(.+)$/i);
  if (categoryMatch) {
    const category = categoryMatch[1].trim();
    if (category) {
      return {
        type: 'CATEGORY_CORRECTION',
        category,
      };
    }
  }

  // 7. Amount Correction: "nominal: <amount>" or "jumlah: <amount>"
  const amountMatch = rawText.match(/^(?:nominal|jumlah)\s*:\s*(.+)$/i);
  if (amountMatch) {
    const amount = parseCurrencyAmount(amountMatch[1]);
    if (amount !== null) {
      return {
        type: 'AMOUNT_CORRECTION',
        amount,
      };
    }
  }

  // 8. Note Correction: "catatan: <notes>" or "ket: <notes>"
  const noteMatch = rawText.match(/^(?:catatan|ket|keterangan)\s*:\s*(.+)$/i);
  if (noteMatch) {
    const note = noteMatch[1].trim();
    if (note) {
      return {
        type: 'NOTE_CORRECTION',
        note,
      };
    }
  }

  // 9. Unrecognized
  return {
    type: 'UNRECOGNIZED',
    rawText,
  };
}

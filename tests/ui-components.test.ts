import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatIDR,
  formatDate,
  formatDateTime,
  getStatusLabel,
  getStatusBadgeVariant,
} from '../lib/client/format';
import { ExpenseStatus } from '../app/generated/prisma/enums';

describe('UI/UX Formatting & Helpers', () => {
  describe('formatIDR Currency Formatter', () => {
    it('should format numbers into Indonesian Rupiah format', () => {
      const result = formatIDR(145000);
      assert(result.includes('145.000') || result.includes('145,000'));
      assert(result.includes('Rp'));
    });

    it('should handle zero and null safely', () => {
      assert.strictEqual(formatIDR(0), 'Rp\u00a00');
      assert.strictEqual(formatIDR(null), 'Rp 0');
      assert.strictEqual(formatIDR(undefined), 'Rp 0');
    });

    it('should format numeric strings correctly', () => {
      const result = formatIDR('2500000');
      assert(result.includes('2.500.000') || result.includes('2,500,000'));
    });
  });

  describe('formatDate & formatDateTime Date Helpers', () => {
    it('should format Date objects into readable Indonesian format', () => {
      const d = new Date('2026-09-01T12:30:00Z');
      const result = formatDate(d);
      assert(result.includes('Sep') || result.includes('Sep'));
      assert(result.includes('2026'));

      const dateTimeResult = formatDateTime(d);
      assert(dateTimeResult.includes('2026'));
      assert(dateTimeResult.length > 8);
    });

    it('should return fallback on null/empty dates', () => {
      assert.strictEqual(formatDate(null), '-');
      assert.strictEqual(formatDate(undefined), '-');
      assert.strictEqual(formatDate('invalid-date'), '-');
    });
  });

  describe('Expense Status Badges & Labels', () => {
    it('should map AUTO status to info variant and Auto OCR label', () => {
      assert.strictEqual(getStatusLabel(ExpenseStatus.AUTO), 'Auto OCR');
      assert.strictEqual(getStatusBadgeVariant(ExpenseStatus.AUTO), 'info');
    });

    it('should map DIKOREKSI_MANUAL to purple variant and Dikoreksi label', () => {
      assert.strictEqual(getStatusLabel(ExpenseStatus.DIKOREKSI_MANUAL), 'Dikoreksi');
      assert.strictEqual(getStatusBadgeVariant(ExpenseStatus.DIKOREKSI_MANUAL), 'purple');
    });

    it('should map INPUT_MANUAL to default variant and Manual label', () => {
      assert.strictEqual(getStatusLabel(ExpenseStatus.INPUT_MANUAL), 'Manual');
      assert.strictEqual(getStatusBadgeVariant(ExpenseStatus.INPUT_MANUAL), 'default');
    });

    it('should map PERLU_REVIEW to warning variant and Perlu Review label', () => {
      assert.strictEqual(getStatusLabel(ExpenseStatus.PERLU_REVIEW), 'Perlu Review');
      assert.strictEqual(getStatusBadgeVariant(ExpenseStatus.PERLU_REVIEW), 'warning');
    });
  });
});

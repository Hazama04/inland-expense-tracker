import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOcrAmount,
  normalizeOcrDate,
  resolveCategory,
  normalizeOcrResult,
} from '../lib/ocr-validator';
import { ExpenseStatus } from '../app/generated/prisma/client';

describe('OCR Normalization & Category Resolution', () => {
  describe('normalizeOcrAmount', () => {
    test('should parse Indonesian dot-thousand currency strings', () => {
      assert.equal(normalizeOcrAmount('Rp 120.000'), 120000);
      assert.equal(normalizeOcrAmount('Rp. 1.250.000'), 1250000);
      assert.equal(normalizeOcrAmount('IDR 45.000'), 45000);
    });

    test('should parse Indonesian decimal format (dot for thousand, comma for sen)', () => {
      assert.equal(normalizeOcrAmount('Rp 120.000,00'), 120000);
      assert.equal(normalizeOcrAmount('1.250.000,50'), 1250000);
    });

    test('should parse US standard comma-thousand dot-decimal', () => {
      assert.equal(normalizeOcrAmount('120,000.00'), 120000);
      assert.equal(normalizeOcrAmount('1,250,000'), 1250000);
    });

    test('should parse numeric types directly', () => {
      assert.equal(normalizeOcrAmount(350000), 350000);
    });

    test('should return null on zero, negative, or invalid amounts', () => {
      assert.equal(normalizeOcrAmount(0), null);
      assert.equal(normalizeOcrAmount('-50000'), null);
      assert.equal(normalizeOcrAmount('GRATIS'), null);
      assert.equal(normalizeOcrAmount(null), null);
    });
  });

  describe('normalizeOcrDate', () => {
    test('should parse ISO format YYYY-MM-DD in UTC representation', () => {
      const d = normalizeOcrDate('2026-09-01');
      assert.equal(d.getUTCFullYear(), 2026);
      assert.equal(d.getUTCMonth(), 8); // 0-indexed: 8 is Sept
      assert.equal(d.getUTCDate(), 1);
      assert.equal(d.toISOString().slice(0, 10), '2026-09-01');
    });

    test('should parse Indonesian slash format DD/MM/YYYY in UTC representation', () => {
      const d = normalizeOcrDate('15/08/2026');
      assert.equal(d.getUTCFullYear(), 2026);
      assert.equal(d.getUTCMonth(), 7); // August
      assert.equal(d.getUTCDate(), 15);
      assert.equal(d.toISOString().slice(0, 10), '2026-08-15');
    });

    test('should parse Indonesian textual month formats in UTC representation', () => {
      const d = normalizeOcrDate('1 September 2026');
      assert.equal(d.getUTCFullYear(), 2026);
      assert.equal(d.getUTCMonth(), 8);
      assert.equal(d.getUTCDate(), 1);
      assert.equal(d.toISOString().slice(0, 10), '2026-09-01');

      const d2 = normalizeOcrDate('20-Agu-2026');
      assert.equal(d2.getUTCFullYear(), 2026);
      assert.equal(d2.getUTCMonth(), 7);
      assert.equal(d2.getUTCDate(), 20);
      assert.equal(d2.toISOString().slice(0, 10), '2026-08-20');
    });
  });

  describe('resolveCategory', () => {
    const mockCategories = [
      { id: 'cat-atk', name: 'ATK', keywords: ['kertas', 'spidol', 'alat tulis', 'gramedia', 'fotocopy'] },
      { id: 'cat-trans', name: 'Transport', keywords: ['bensin', 'pertamina', 'shell', 'grab', 'gojek', 'toll'] },
      { id: 'cat-konsumsi', name: 'Konsumsi', keywords: ['makan', 'restoran', 'kopi', 'indomaret', 'alfamart'] },
    ];

    test('should match exact category name', () => {
      assert.equal(resolveCategory('ATK', 'Toko Buku', mockCategories), 'cat-atk');
      assert.equal(resolveCategory('Transport', 'SPBU', mockCategories), 'cat-trans');
    });

    test('should match candidate keywords', () => {
      assert.equal(resolveCategory('Beli bensin motor', 'SPBU', mockCategories), 'cat-trans');
    });

    test('should match merchant keywords', () => {
      assert.equal(resolveCategory(null, 'SPBU Pertamina 34-1234', mockCategories), 'cat-trans');
      assert.equal(resolveCategory(null, 'Indomaret Point Stasiun', mockCategories), 'cat-konsumsi');
    });

    test('should return null if no category matches', () => {
      assert.equal(resolveCategory('Langganan Software Cloud', 'AWS Corp', mockCategories), null);
    });
  });

  describe('normalizeOcrResult (Complete Domain Evaluation)', () => {
    const mockCategories = [
      { id: 'cat-atk', name: 'ATK', keywords: ['kertas', 'spidol', 'alat tulis'] },
    ];

    test('should produce AUTO status when confidence is high and data is complete', () => {
      const normalized = normalizeOcrResult(
        {
          merchant: 'Gramedia Mall',
          transactionDate: '2026-09-01',
          amount: 'Rp 145.000',
          categoryCandidate: 'ATK',
          notes: 'Pembelian binder dan kertas',
          confidenceScore: 0.92,
        },
        mockCategories
      );

      assert.equal(normalized.status, ExpenseStatus.AUTO);
      assert.equal(normalized.merchant, 'Gramedia Mall');
      assert.equal(normalized.amount.toNumber(), 145000);
      assert.equal(normalized.categoryId, 'cat-atk');
      assert.equal(normalized.reviewReasons.length, 0);
    });

    test('should produce PERLU_REVIEW when confidence is low (< 0.75)', () => {
      const normalized = normalizeOcrResult(
        {
          merchant: 'Gramedia Mall',
          transactionDate: '2026-09-01',
          amount: 'Rp 145.000',
          categoryCandidate: 'ATK',
          notes: 'Struk agak buram',
          confidenceScore: 0.65,
        },
        mockCategories
      );

      assert.equal(normalized.status, ExpenseStatus.PERLU_REVIEW);
      assert.ok(normalized.reviewReasons.some((r) => r.includes('Akurasi OCR rendah')));
    });

    test('should produce PERLU_REVIEW when category could not be resolved', () => {
      const normalized = normalizeOcrResult(
        {
          merchant: 'Toko Misterius',
          transactionDate: '2026-09-01',
          amount: '50000',
          categoryCandidate: 'Unknown',
          notes: null,
          confidenceScore: 0.95,
        },
        mockCategories
      );

      assert.equal(normalized.status, ExpenseStatus.PERLU_REVIEW);
      assert.equal(normalized.categoryId, null);
    });
  });
});

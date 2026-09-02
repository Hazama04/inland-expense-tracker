import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
(process.env as Record<string, string | undefined>).MOCK_GEMINI = 'true';

import { receiptService } from '../services/receipt.service';
import { geminiClient } from '../lib/gemini';
import { storageService } from '../lib/storage';
import { staffRepository } from '../repositories/staff.repository';
import { categoryRepository } from '../repositories/category.repository';
import { expenseService } from '../services/expense.service';
import { ExpenseStatus, Prisma } from '../app/generated/prisma/client';
import { ExpenseWithRelations } from '../repositories/expense.repository';

describe('Receipt Processing Pipeline Integration', () => {
  const testStaffId = 'staff-pipeline-001';
  const testPhone = '+6281299990001';

  const mockStaff = {
    id: testStaffId,
    name: 'Staf Uji Pipeline',
    phoneNumber: testPhone,
    role: 'STAFF' as const,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCategory = {
    id: 'cat-atk',
    name: 'ATK',
    keywords: ['kertas', 'spidol', 'map'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    storageService._clearMockStorage();
    geminiClient._setMockResponse(null);

    // Mock staff repository lookups
    staffRepository.findActiveByPhone = async (phone: string) => {
      if (phone === testPhone) return mockStaff;
      return null;
    };

    staffRepository.findById = async (id: string) => {
      if (id === testStaffId) return mockStaff;
      return null;
    };

    // Mock active categories
    categoryRepository.findActive = async () => [mockCategory];
    categoryRepository.findById = async (id: string) => (id === 'cat-atk' ? mockCategory : null);

    // Mock expense creation
    expenseService.createExpense = async (actor, input) => {
      const mockCreated: ExpenseWithRelations = {
        id: 'exp-created-123',
        staffId: actor.id,
        categoryId: input.categoryId || null,
        merchant: input.merchant,
        transactionDate: input.transactionDate,
        amount: new Prisma.Decimal(input.amount),
        status: input.status || ExpenseStatus.AUTO,
        receiptImagePath: input.receiptImagePath || null,
        rawOcrResponse: (input.rawOcrResponse as Prisma.JsonValue) || null,
        confidenceScore: input.confidenceScore ? new Prisma.Decimal(input.confidenceScore) : null,
        notes: input.notes || null,
        sheetRowId: null,
        syncedToSheet: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        staff: mockStaff,
        category: input.categoryId === 'cat-atk' ? mockCategory : null,
      };
      return mockCreated;
    };
  });

  test('should reject non-whitelisted sender and not create expense', async () => {
    const result = await receiptService.processReceipt({
      senderPhone: '+6289999999999',
      mediaUrl: 'https://example.com/receipt.jpg',
    });

    assert.equal(result.success, false);
    assert.match(result.error || '', /Unauthorized/);
  });

  test('should successfully process valid receipt with AUTO status and upload blob', async () => {
    // 1. Mock valid Gemini OCR output
    geminiClient._setMockResponse({
      merchant: 'Gramedia Asri',
      transactionDate: '2026-09-01',
      amount: '185000',
      categoryCandidate: 'ATK',
      notes: 'Beli map dan spidol',
      confidenceScore: 0.94,
    });

    // 2. Mock safe image buffer in download
    const fakeJpegBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00,
    ]);

    const originalFetch = global.fetch;
    global.fetch = async (url: RequestInfo | URL) => {
      if (url.toString().includes('receipt.jpg')) {
        return new Response(fakeJpegBuffer, {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg', 'Content-Length': fakeJpegBuffer.length.toString() },
        });
      }
      return originalFetch(url);
    };

    try {
      const result = await receiptService.processReceipt({
        senderPhone: testPhone,
        mediaUrl: 'https://example.com/receipt.jpg',
      });

      assert.equal(result.success, true);
      assert.equal(result.merchant, 'Gramedia Asri');
      assert.equal(result.amount, '185000');
      assert.equal(result.status, ExpenseStatus.AUTO);
      assert.ok(result.receiptPath);
      assert.match(result.receiptPath, /^receipts\/\d{4}\/\d{2}\/staff-pipeline-001\//);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('should classify low confidence OCR result as PERLU_REVIEW', async () => {
    geminiClient._setMockResponse({
      merchant: 'Warung Buram',
      transactionDate: '2026-09-01',
      amount: '50000',
      categoryCandidate: null,
      notes: 'Foto struk sangat gelap',
      confidenceScore: 0.55,
    });

    const fakeJpegBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);

    const originalFetch = global.fetch;
    global.fetch = async (url: RequestInfo | URL) => {
      if (url.toString().includes('receipt-dark.jpg')) {
        return new Response(fakeJpegBuffer, {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }
      return originalFetch(url);
    };

    try {
      const result = await receiptService.processReceipt({
        senderPhone: testPhone,
        mediaUrl: 'https://example.com/receipt-dark.jpg',
      });

      assert.equal(result.success, true);
      assert.equal(result.status, ExpenseStatus.PERLU_REVIEW);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

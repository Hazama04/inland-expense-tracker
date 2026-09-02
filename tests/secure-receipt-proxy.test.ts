import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/expenses/[id]/receipt/route';
import { expenseRepository } from '../repositories/expense.repository';
import { staffRepository } from '../repositories/staff.repository';
import { storageService } from '../lib/storage';
import { createSessionToken } from '../lib/auth/token';
import { Prisma, ExpenseStatus } from '../app/generated/prisma/client';

describe('Secure Receipt Proxy Route (GET /api/expenses/[id]/receipt)', () => {
  const staffA = { id: 'staff-a', name: 'Staf A', phoneNumber: '+628111111111', role: 'STAFF' as const, isActive: true, createdAt: new Date(), updatedAt: new Date() };
  const staffB = { id: 'staff-b', name: 'Staf B', phoneNumber: '+628222222222', role: 'STAFF' as const, isActive: true, createdAt: new Date(), updatedAt: new Date() };
  const financeUser = { id: 'finance-1', name: 'Finance 1', phoneNumber: '+628333333333', role: 'FINANCE' as const, isActive: true, createdAt: new Date(), updatedAt: new Date() };

  const testExpense = {
    id: 'exp-receipt-test-1',
    staffId: 'staff-a',
    categoryId: 'cat-atk',
    merchant: 'Gramedia Official',
    transactionDate: new Date('2026-09-01'),
    amount: new Prisma.Decimal(125000),
    status: ExpenseStatus.AUTO,
    receiptImagePath: 'receipts/2026/09/staff-a/test-receipt.jpg',
    rawOcrResponse: null,
    confidenceScore: new Prisma.Decimal(0.95),
    notes: null,
    sheetRowId: null,
    syncedToSheet: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    staff: staffA,
    category: { id: 'cat-atk', name: 'ATK', keywords: [], isActive: true, createdAt: new Date(), updatedAt: new Date() },
  };

  beforeEach(async () => {
    storageService._clearMockStorage();
    // Put fake image in mock storage
    const uploadRes = await storageService.uploadReceipt({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
      staffId: 'staff-a',
      extension: 'jpg',
      contentType: 'image/jpeg',
    });
    testExpense.receiptImagePath = uploadRes.pathname;

    // Mock staff lookup for session verification
    staffRepository.findById = async (id: string) => {
      if (id === 'staff-a') return staffA;
      if (id === 'staff-b') return staffB;
      if (id === 'finance-1') return financeUser;
      return null;
    };

    // Mock expense lookup
    expenseRepository.findById = async (id: string) => {
      if (id === testExpense.id) return testExpense;
      return null;
    };
  });

  test('should reject unauthenticated request with 401 Unauthorized', async () => {
    const req = new NextRequest('http://localhost:3000/api/expenses/exp-receipt-test-1/receipt');
    const res = await GET(req, { params: Promise.resolve({ id: 'exp-receipt-test-1' }) });

    assert.equal(res.status, 401);
  });

  test('should reject IDOR attempt (Staff B accessing Staff A receipt) with 403 Forbidden', async () => {
    const token = await createSessionToken(staffB);
    const req = new NextRequest('http://localhost:3000/api/expenses/exp-receipt-test-1/receipt', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await GET(req, { params: Promise.resolve({ id: 'exp-receipt-test-1' }) });
    assert.equal(res.status, 403);
  });

  test('should allow owner Staff A to access own receipt with security headers', async () => {
    const token = await createSessionToken(staffA);
    const req = new NextRequest('http://localhost:3000/api/expenses/exp-receipt-test-1/receipt', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await GET(req, { params: Promise.resolve({ id: 'exp-receipt-test-1' }) });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(res.headers.get('Cache-Control') || '', /private/);
  });

  test('should allow Finance role to access any staff receipt', async () => {
    const token = await createSessionToken(financeUser);
    const req = new NextRequest('http://localhost:3000/api/expenses/exp-receipt-test-1/receipt', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await GET(req, { params: Promise.resolve({ id: 'exp-receipt-test-1' }) });
    assert.equal(res.status, 200);
  });

  test('should return 404 on nonexistent expense ID', async () => {
    const token = await createSessionToken(financeUser);
    const req = new NextRequest('http://localhost:3000/api/expenses/nonexistent-id/receipt', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await GET(req, { params: Promise.resolve({ id: 'nonexistent-id' }) });
    assert.equal(res.status, 404);
  });
});

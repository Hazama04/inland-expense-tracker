import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import * as webhookRoute from '../app/api/webhook/route';
const { POST: webhookHandler } = webhookRoute;
import { staffRepository } from '../repositories/staff.repository';
import { categoryRepository } from '../repositories/category.repository';
import { expenseService } from '../services/expense.service';
import { ExpenseWithRelations } from '../repositories/expense.repository';
import { Staff, StaffRole, ExpenseStatus } from '../app/generated/prisma/client';
import { fonnteClient } from '../lib/fonnte';
import { Decimal } from '@prisma/client/runtime/client';

// Override backgroundScheduler.schedule to execute synchronously in tests.
// The real implementation delegates to Next.js after(), which requires an active
// request context that is not available in the node:test runner environment.
webhookRoute.backgroundScheduler.schedule = (fn) => { fn().catch(() => {}); };

describe('Fonnte WhatsApp Webhook & Bot Integration', () => {
  const activeStaff: Staff = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    name: 'Gilang Staf',
    phoneNumber: '+6281234567890',
    role: StaffRole.STAFF,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleCategory = {
    id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    name: 'ATK & Perlengkapan',
    keywords: ['atk', 'kertas', 'spidol', 'pulpen'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  categoryRepository.findByName = async () => sampleCategory;
  categoryRepository.findById = async () => sampleCategory;

  // Mock outbound Fonnte messaging
  const sentMessages: Array<{ target: string; message: string }> = [];
  fonnteClient.sendMessage = async (params) => {
    sentMessages.push(params);
    return { status: true, message: 'Mock sent' };
  };

  beforeEach(() => {
    sentMessages.length = 0;
    process.env.FONNTE_WEBHOOK_TOKEN = 'test_webhook_secret_token_123';
  });

  describe('Webhook Secret Verification (Layer 1 Security)', () => {
    it('should reject requests with invalid webhook secret token (401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer wrong_token',
        },
        body: JSON.stringify({
          sender: '081234567890',
          message: 'bantuan',
        }),
      });

      const res = await webhookHandler(req);
      assert.strictEqual(res.status, 401);
      const json = await res.json();
      assert.strictEqual(json.error.code, 'UNAUTHORIZED_WEBHOOK');
    });

    it('should accept requests with valid webhook secret token', async () => {
      // Mock active staff lookup
      staffRepository.findActiveByPhone = async (phone: string) => {
        return phone === activeStaff.phoneNumber ? activeStaff : null;
      };

      const req = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer test_webhook_secret_token_123',
        },
        body: JSON.stringify({
          sender: '081234567890',
          message: 'bantuan',
        }),
      });

      const res = await webhookHandler(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.data.status, 'help_sent');
      assert(sentMessages.length > 0);
      assert(sentMessages[0].message.includes('bot pencatat pengeluaran kantor'));
    });
  });

  describe('Staff Whitelist & Inactive Protection (Layer 2 Security)', () => {
    it('should block unauthorized non-whitelisted sender with rejection WhatsApp message', async () => {
      staffRepository.findActiveByPhone = async () => null;

      const req = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer test_webhook_secret_token_123',
        },
        body: JSON.stringify({
          sender: '089999999999',
          message: 'manual: Indomaret | 50000 | ATK',
        }),
      });

      const res = await webhookHandler(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.data.status, 'rejected_unauthorized');

      assert.strictEqual(sentMessages.length, 1);
      assert(sentMessages[0].message.includes('nomor Anda belum terdaftar sebagai staf'));
    });
  });

  describe('Receipt Image Ingestion Flow', () => {
    it('should acknowledge receipt images immediately', async () => {
      staffRepository.findActiveByPhone = async () => activeStaff;

      const req = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer test_webhook_secret_token_123',
        },
        body: JSON.stringify({
          sender: '081234567890',
          url: 'https://cdn.fonnte.com/receipt_sample_123.jpg',
          message: 'Struk bensin SPBU',
        }),
      });

      const res = await webhookHandler(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.data.status, 'receipt_received');

      assert.strictEqual(sentMessages.length, 1);
      assert.strictEqual(sentMessages[0].message, '📸 Struk diterima, sedang diproses...');
    });
  });

  describe('Idempotency & Replay Protection', () => {
    it('should ignore duplicate webhook message IDs', async () => {
      staffRepository.findActiveByPhone = async () => activeStaff;

      const payload = {
        id: 'msg_unique_id_99999',
        sender: '081234567890',
        message: 'bantuan',
      };

      const req1 = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer test_webhook_secret_token_123',
        },
        body: JSON.stringify(payload),
      });

      const res1 = await webhookHandler(req1);
      assert.strictEqual(res1.status, 200);

      // Re-send with same message ID
      const req2 = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer test_webhook_secret_token_123',
        },
        body: JSON.stringify(payload),
      });

      const res2 = await webhookHandler(req2);
      assert.strictEqual(res2.status, 200);
      const json2 = await res2.json();
      assert.strictEqual(json2.data.status, 'ignored_duplicate');
    });
  });

  describe('Bot Commands Execution', () => {
    it('should handle "manual: Indomaret | 145000 | ATK" command', async () => {
      staffRepository.findActiveByPhone = async () => activeStaff;
      categoryRepository.findByName = async () => sampleCategory;

      const mockCreatedExpense: ExpenseWithRelations = {
        id: 'exp_manual_123',
        staffId: activeStaff.id,
        merchant: 'Indomaret Cipayung',
        amount: new Decimal(145000),
        transactionDate: new Date(),
        categoryId: sampleCategory.id,
        status: ExpenseStatus.INPUT_MANUAL,
        receiptImagePath: null,
        confidenceScore: null,
        rawOcrResponse: null,
        notes: 'Input manual via WhatsApp bot',
        sheetRowId: null,
        syncedToSheet: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        staff: activeStaff,
        category: sampleCategory,
      };

      expenseService.createExpense = async () => mockCreatedExpense;

      const req = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer test_webhook_secret_token_123',
        },
        body: JSON.stringify({
          sender: '081234567890',
          message: 'manual: Indomaret Cipayung | 145000 | ATK',
        }),
      });

      const res = await webhookHandler(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.data.status, 'manual_expense_created');

      assert(sentMessages.length > 0);
      assert(sentMessages[0].message.includes('Pengeluaran tercatat secara manual!'));
      assert(sentMessages[0].message.includes('Indomaret Cipayung'));
    });

    it('should handle conversational correction "kategori: Transport"', async () => {
      staffRepository.findActiveByPhone = async () => activeStaff;
      categoryRepository.findByName = async () => sampleCategory;

      const recentExpense: ExpenseWithRelations = {
        id: 'exp_recent_001',
        staffId: activeStaff.id,
        merchant: 'SPBU Pertamina',
        amount: new Decimal(100000),
        transactionDate: new Date(),
        categoryId: sampleCategory.id,
        status: ExpenseStatus.AUTO,
        receiptImagePath: null,
        confidenceScore: null,
        rawOcrResponse: null,
        notes: null,
        sheetRowId: null,
        syncedToSheet: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        staff: activeStaff,
        category: sampleCategory,
      };

      expenseService.getLastExpenseForCorrection = async () => recentExpense;
      expenseService.updateExpense = async () => ({
        ...recentExpense,
        category: { ...sampleCategory, name: 'Transport' },
      });

      const req = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer test_webhook_secret_token_123',
        },
        body: JSON.stringify({
          sender: '081234567890',
          message: 'kategori: Transport',
        }),
      });

      const res = await webhookHandler(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.data.status, 'category_updated');

      assert(sentMessages.length > 0);
      assert(sentMessages[0].message.includes('Data pengeluaran diperbarui!'));
    });

    it('should handle "riwayat" history command', async () => {
      staffRepository.findActiveByPhone = async () => activeStaff;

      const mockExpenses: ExpenseWithRelations[] = [
        {
          id: 'exp_1',
          staffId: activeStaff.id,
          merchant: 'Indomaret',
          amount: new Decimal(50000),
          transactionDate: new Date(),
          categoryId: sampleCategory.id,
          status: ExpenseStatus.AUTO,
          receiptImagePath: null,
          confidenceScore: null,
          rawOcrResponse: null,
          notes: null,
          sheetRowId: null,
          syncedToSheet: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          staff: activeStaff,
          category: sampleCategory,
        },
      ];

      expenseService.listExpenses = async () => ({
        items: mockExpenses,
        meta: { total: 1, page: 1, pageSize: 5, totalPages: 1 },
      });

      const req = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer test_webhook_secret_token_123',
        },
        body: JSON.stringify({
          sender: '081234567890',
          message: 'riwayat',
        }),
      });

      const res = await webhookHandler(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.data.status, 'history_sent');

      assert(sentMessages.length > 0);
      assert(sentMessages[0].message.includes('5 Pengeluaran Terakhir'));
    });

    it('should handle "total bulan ini" monthly total command', async () => {
      staffRepository.findActiveByPhone = async () => activeStaff;

      const mockExpenses: ExpenseWithRelations[] = [
        {
          id: 'exp_1',
          staffId: activeStaff.id,
          merchant: 'Indomaret',
          amount: new Decimal(100000),
          transactionDate: new Date(),
          categoryId: sampleCategory.id,
          status: ExpenseStatus.AUTO,
          receiptImagePath: null,
          confidenceScore: null,
          rawOcrResponse: null,
          notes: null,
          sheetRowId: null,
          syncedToSheet: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          staff: activeStaff,
          category: sampleCategory,
        },
        {
          id: 'exp_2',
          staffId: activeStaff.id,
          merchant: 'SPBU Pertamina',
          amount: new Decimal(200000),
          transactionDate: new Date(),
          categoryId: sampleCategory.id,
          status: ExpenseStatus.AUTO,
          receiptImagePath: null,
          confidenceScore: null,
          rawOcrResponse: null,
          notes: null,
          sheetRowId: null,
          syncedToSheet: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          staff: activeStaff,
          category: sampleCategory,
        },
      ];

      expenseService.listExpenses = async () => ({
        items: mockExpenses,
        meta: { total: 2, page: 1, pageSize: 100, totalPages: 1 },
      });

      const req = new NextRequest('http://localhost:3000/api/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer test_webhook_secret_token_123',
        },
        body: JSON.stringify({
          sender: '081234567890',
          message: 'total bulan ini',
        }),
      });

      const res = await webhookHandler(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.data.status, 'month_total_sent');
      assert.strictEqual(json.data.total, 300000);

      assert(sentMessages.length > 0);
      assert(sentMessages[0].message.includes('Total Pengeluaran Bulan'));
      assert(sentMessages[0].message.includes('300.000'));
    });
  });
});

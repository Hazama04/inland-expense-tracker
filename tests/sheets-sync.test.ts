import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
(process.env as Record<string, string | undefined>).MOCK_SHEETS = 'true';
(process.env as Record<string, string | undefined>).AUTH_SECRET = 'inland_expense_tracker_secret_test_min_32_characters!';
(process.env as Record<string, string | undefined>).CRON_SECRET = 'test_cron_secret_min_32_chars_long!';

import {
  googleSheetsClient,
  mapSheetsError,
  sanitizeSheetsErrorMessage,
} from '../lib/google-sheets';
import {
  sheetsSyncService,
  calculateNextRetry,
  mapExpenseToSheetRow,
} from '../services/sheets-sync.service';
import { syncFailureRepository } from '../repositories/sync-failure.repository';
import { expenseRepository, ExpenseWithRelations } from '../repositories/expense.repository';
import { staffRepository } from '../repositories/staff.repository';
import { auditRepository } from '../repositories/audit.repository';
import { GET as cronHandler } from '../app/api/cron/sync-sheets/route';
import { POST as manualRetryHandler } from '../app/api/sync/sheets/retry/[id]/route';
import { ExpenseStatus, AuditAction, StaffRole, Prisma, SyncFailure, AuditLog } from '../app/generated/prisma/client';
import prisma from '../lib/db/prisma';
import { createSessionToken } from '../lib/auth/token';

describe('Google Sheets Synchronization & Durable Retry (V12)', () => {
  const mockStaff = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Budi Staf Lapangan',
    phoneNumber: '+6281234567890',
    role: StaffRole.STAFF,
    isActive: true,
    createdAt: new Date('2026-09-01T08:00:00Z'),
    updatedAt: new Date('2026-09-01T08:00:00Z'),
  };

  const mockFinance = {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Siti Finance',
    phoneNumber: '+6281299990001',
    role: StaffRole.FINANCE,
    isActive: true,
    createdAt: new Date('2026-09-01T08:00:00Z'),
    updatedAt: new Date('2026-09-01T08:00:00Z'),
  };

  const mockAdmin = {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Dewi Admin',
    phoneNumber: '+6281299990002',
    role: StaffRole.ADMIN,
    isActive: true,
    createdAt: new Date('2026-09-01T08:00:00Z'),
    updatedAt: new Date('2026-09-01T08:00:00Z'),
  };

  const mockCategory = {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'Operasional',
    keywords: ['bensin', 'tol', 'parkir'],
    isActive: true,
    createdAt: new Date('2026-09-01T08:00:00Z'),
    updatedAt: new Date('2026-09-01T08:00:00Z'),
  };

  const sampleExpense: ExpenseWithRelations = {
    id: '55555555-5555-5555-5555-555555555555',
    staffId: mockStaff.id,
    categoryId: mockCategory.id,
    merchant: 'SPBU Pertamina Kuningan',
    transactionDate: new Date('2026-09-01T00:00:00Z'),
    amount: new Prisma.Decimal('150000'),
    status: ExpenseStatus.AUTO,
    receiptImagePath: 'receipts/2026/09/staff1/sample.jpg',
    rawOcrResponse: { mock: true },
    confidenceScore: new Prisma.Decimal('0.9500'),
    notes: 'Bensin operasional kantor',
    sheetRowId: null,
    syncedToSheet: false,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
    staff: mockStaff,
    category: mockCategory,
  };

  let inMemoryExpenses: Map<string, ExpenseWithRelations>;
  let inMemorySyncFailures: Map<string, SyncFailure>;
  let inMemoryAuditLogs: AuditLog[];

  beforeEach(() => {
    googleSheetsClient._clearMock();

    inMemoryExpenses = new Map();
    inMemoryExpenses.set(sampleExpense.id, { ...sampleExpense });

    inMemorySyncFailures = new Map();
    inMemoryAuditLogs = [];

    // Mock Staff repository methods
    staffRepository.findById = async (id: string) => {
      if (id === mockStaff.id) return { ...mockStaff };
      if (id === mockFinance.id) return { ...mockFinance };
      if (id === mockAdmin.id) return { ...mockAdmin };
      return null;
    };

    // Mock Expense repository methods
    expenseRepository.findById = async (id: string) => {
      const found = inMemoryExpenses.get(id);
      return found ? { ...found } : null;
    };

    // Mock Prisma update on expense
    prisma.expense.update = (async (args: { where: { id: string }; data: Prisma.ExpenseUpdateInput }) => {
      const existing = inMemoryExpenses.get(args.where.id);
      if (!existing) throw new Error('Record not found');
      const updated: ExpenseWithRelations = {
        ...existing,
        ...(args.data as Partial<ExpenseWithRelations>),
      };
      inMemoryExpenses.set(args.where.id, updated);
      return updated;
    }) as unknown as typeof prisma.expense.update;

    // Mock SyncFailure repository methods
    syncFailureRepository.findByExpenseId = async (expenseId: string) => {
      return inMemorySyncFailures.get(expenseId) || null;
    };

    syncFailureRepository.upsertFailure = async (params) => {
      const record: SyncFailure = {
        id: `sf-${params.expenseId}`,
        expenseId: params.expenseId,
        errorCode: params.errorCode || null,
        lastError: params.errorMessage,
        attemptCount: params.attemptCount,
        nextRetryAt: params.nextRetryAt || null,
        lastAttemptAt: params.lastAttemptAt || new Date(),
        resolved: params.resolved || false,
        resolvedAt: params.resolvedAt || null,
        claimedAt: null,
        claimedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      inMemorySyncFailures.set(params.expenseId, record);
      return record;
    };

    syncFailureRepository.markResolved = async (expenseId: string) => {
      const existing = inMemorySyncFailures.get(expenseId);
      if (existing) {
        existing.resolved = true;
        existing.resolvedAt = new Date();
        existing.nextRetryAt = null;
        existing.claimedAt = null;
        existing.claimedBy = null;
      }
      return existing || null;
    };

    syncFailureRepository.claimDueForRetry = async (batchSize = 20, workerId, now = new Date()) => {
      const limit = batchSize ?? 20;
      const claimed: SyncFailure[] = [];
      for (const failure of inMemorySyncFailures.values()) {
        if (
          !failure.resolved &&
          failure.attemptCount <= 5 &&
          (!failure.nextRetryAt || failure.nextRetryAt <= now) &&
          !failure.claimedAt
        ) {
          failure.claimedAt = now;
          failure.claimedBy = workerId;
          claimed.push({ ...failure });
          if (claimed.length >= limit) break;
        }
      }
      return claimed;
    };

    syncFailureRepository.releaseClaim = async (expenseId: string) => {
      const failure = inMemorySyncFailures.get(expenseId);
      if (failure) {
        failure.claimedAt = null;
        failure.claimedBy = null;
      }
    };

    // Mock Audit repository
    auditRepository.create = async (params) => {
      const log: AuditLog = {
        id: `audit-${inMemoryAuditLogs.length + 1}`,
        expenseId: params.expenseId ?? null,
        action: params.action,
        actorPhone: params.actorPhone,
        oldValue: (params.oldValue as Prisma.JsonValue) ?? null,
        newValue: (params.newValue as Prisma.JsonValue) ?? null,
        createdAt: new Date(),
      };
      inMemoryAuditLogs.push(log);
      return log;
    };
  });

  describe('Row Mapping & Schema Determinism', () => {
    test('should deterministically map Expense entity to expected spreadsheet columns', () => {
      const mapped = mapExpenseToSheetRow(sampleExpense);

      assert.equal(mapped.length, 11);
      assert.equal(mapped[0], sampleExpense.id); // ID (UUID)
      assert.equal(mapped[1], '2026-09-01'); // Tanggal (YYYY-MM-DD)
      assert.equal(mapped[2], 'SPBU Pertamina Kuningan'); // Merchant
      assert.equal(mapped[3], 150000); // Nominal
      assert.equal(mapped[4], 'Operasional'); // Kategori
      assert.equal(mapped[5], 'Bensin operasional kantor'); // Catatan
      assert.equal(mapped[6], ExpenseStatus.AUTO); // Status
      assert.equal(mapped[7], 'Budi Staf Lapangan (+6281234567890)'); // Staff
      assert.equal(mapped[8], '95%'); // Confidence
      assert.equal(mapped[9], sampleExpense.createdAt.toISOString()); // Created At
      assert.equal(mapped[10], sampleExpense.updatedAt.toISOString()); // Updated At
    });
  });

  describe('Idempotent Synchronization (Append vs Update)', () => {
    test('should append new row when Expense ID is not yet in Google Sheets', async () => {
      const result = await sheetsSyncService.syncExpense(sampleExpense.id);

      assert.equal(result.success, true);
      assert.equal(result.operation, 'APPEND');
      assert.ok(result.sheetRowId?.startsWith('row_'));

      // Check Neon state
      const updatedExpense = inMemoryExpenses.get(sampleExpense.id);
      assert.equal(updatedExpense?.syncedToSheet, true);
      assert.equal(updatedExpense?.sheetRowId, result.sheetRowId);

      // Check Sheets state
      const mockRows = googleSheetsClient._getMockRows();
      assert.equal(mockRows.length, 1);
      assert.equal(mockRows[0].values[0], sampleExpense.id);

      // Check Audit Log
      assert.ok(inMemoryAuditLogs.some((l) => l.action === AuditAction.SHEETS_SYNCED));
    });

    test('should update existing row when Expense ID is already present (UUID idempotency)', async () => {
      // Seed existing row at Row 14 with older amount
      googleSheetsClient._setMockRows([
        {
          rowIndex: 14,
          values: [sampleExpense.id, '2026-09-01', 'Old Merchant', 100000, 'Lain-lain', '', 'AUTO', 'Budi', '90%', '', ''],
        },
      ]);

      const result = await sheetsSyncService.syncExpense(sampleExpense.id);

      assert.equal(result.success, true);
      assert.equal(result.operation, 'UPDATE');
      assert.equal(result.sheetRowId, 'row_14');

      // Check Sheets state: must update in-place at Row 14 without appending a duplicate row
      const mockRows = googleSheetsClient._getMockRows();
      assert.equal(mockRows.length, 1);
      assert.equal(mockRows[0].rowIndex, 14);
      assert.equal(mockRows[0].values[2], 'SPBU Pertamina Kuningan'); // Updated merchant
      assert.equal(mockRows[0].values[3], 150000); // Updated amount
    });
  });

  describe('Failure Handling & Durable Retry Schedule', () => {
    test('should persist failure in Neon with exponential backoff on Google API error without rolling back expense', async () => {
      googleSheetsClient._setMockError(new Error('503 Service Unavailable: Google backend experiencing high load'));

      const result = await sheetsSyncService.syncExpense(sampleExpense.id);

      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'SHEETS_SERVICE_UNAVAILABLE');
      assert.equal(result.attemptCount, 1);
      assert.ok(result.nextRetryAt instanceof Date);

      // Check Neon Expense remains intact but marked un-synced
      const expenseInDb = inMemoryExpenses.get(sampleExpense.id);
      assert.ok(expenseInDb !== undefined);
      assert.equal(expenseInDb?.syncedToSheet, false);

      // Check SyncFailure record
      const failure = inMemorySyncFailures.get(sampleExpense.id);
      assert.ok(failure !== undefined);
      assert.equal(failure.attemptCount, 1);
      assert.equal(failure.errorCode, 'SHEETS_SERVICE_UNAVAILABLE');
      assert.equal(failure.resolved, false);

      // Check Audit Log
      assert.ok(inMemoryAuditLogs.some((l) => l.action === AuditAction.SHEETS_SYNC_FAILED));
    });

    test('should strictly calculate exponential backoff intervals for 5 attempts', () => {
      const baseTime = new Date('2026-09-01T12:00:00Z');

      // Attempt 1: +1 min
      const r1 = calculateNextRetry(0, baseTime);
      assert.equal(r1.nextRetryAt?.toISOString(), '2026-09-01T12:01:00.000Z');
      assert.equal(r1.isMaxExceeded, false);

      // Attempt 2: +5 min
      const r2 = calculateNextRetry(1, baseTime);
      assert.equal(r2.nextRetryAt?.toISOString(), '2026-09-01T12:05:00.000Z');

      // Attempt 3: +15 min
      const r3 = calculateNextRetry(2, baseTime);
      assert.equal(r3.nextRetryAt?.toISOString(), '2026-09-01T12:15:00.000Z');

      // Attempt 4: +1 hour
      const r4 = calculateNextRetry(3, baseTime);
      assert.equal(r4.nextRetryAt?.toISOString(), '2026-09-01T13:00:00.000Z');

      // Attempt 5: +4 hours
      const r5 = calculateNextRetry(4, baseTime);
      assert.equal(r5.nextRetryAt?.toISOString(), '2026-09-01T16:00:00.000Z');

      // Attempt > 5: Max exceeded (null)
      const r6 = calculateNextRetry(5, baseTime);
      assert.equal(r6.nextRetryAt, null);
      assert.equal(r6.isMaxExceeded, true);
    });

    test('should resolve SyncFailure record once transient failure is fixed', async () => {
      // 1. First attempt fails
      googleSheetsClient._setMockError(new Error('429 Too Many Requests: Rate limit'));
      await sheetsSyncService.syncExpense(sampleExpense.id);

      assert.equal(inMemorySyncFailures.get(sampleExpense.id)?.resolved, false);

      // 2. Second attempt succeeds
      googleSheetsClient._setMockError(null);
      const res = await sheetsSyncService.syncExpense(sampleExpense.id, { isCronRetry: true });

      assert.equal(res.success, true);
      assert.equal(inMemorySyncFailures.get(sampleExpense.id)?.resolved, true);
      assert.equal(inMemoryExpenses.get(sampleExpense.id)?.syncedToSheet, true);
      assert.ok(inMemoryAuditLogs.some((l) => l.action === AuditAction.SHEETS_RETRY));
    });
  });

  describe('Concurrency & Atomic Lock Safety', () => {
    test('should prevent concurrent cron workers from processing the same failure', async () => {
      // Seed an unresolved failure due for retry
      inMemorySyncFailures.set(sampleExpense.id, {
        id: 'sf-1',
        expenseId: sampleExpense.id,
        attemptCount: 1,
        errorCode: null,
        lastError: 'Temporary network issue',
        nextRetryAt: new Date(Date.now() - 10000), // Due in past
        lastAttemptAt: new Date(),
        resolvedAt: null,
        resolved: false,
        claimedAt: null,
        claimedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Worker A claims batch
      const claimedA = await syncFailureRepository.claimDueForRetry(20, 'worker-A');
      assert.equal(claimedA.length, 1);
      assert.equal(claimedA[0].expenseId, sampleExpense.id);

      // Worker B tries to claim at the exact same moment
      const claimedB = await syncFailureRepository.claimDueForRetry(20, 'worker-B');
      assert.equal(claimedB.length, 0); // Worker B receives 0 items because Worker A holds lock
    });
  });

  describe('Vercel Cron Worker Endpoint (GET /api/cron/sync-sheets)', () => {
    test('should reject unauthenticated request with 401 Unauthorized', async () => {
      const req = new NextRequest('http://localhost:3000/api/cron/sync-sheets', {
        method: 'GET',
      });

      const res = await cronHandler(req);
      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.ok(json.error.includes('Unauthorized'));
    });

    test('should reject request with invalid secret token with 401 Unauthorized', async () => {
      const req = new NextRequest('http://localhost:3000/api/cron/sync-sheets', {
        method: 'GET',
        headers: {
          authorization: 'Bearer wrong_token_value',
        },
      });

      const res = await cronHandler(req);
      assert.equal(res.status, 401);
    });

    test('should accept valid CRON_SECRET and return execution summary', async () => {
      // Seed a due failure
      inMemorySyncFailures.set(sampleExpense.id, {
        id: 'sf-1',
        expenseId: sampleExpense.id,
        attemptCount: 1,
        errorCode: null,
        lastError: 'Temporary network issue',
        nextRetryAt: new Date(Date.now() - 10000),
        lastAttemptAt: new Date(),
        resolvedAt: null,
        resolved: false,
        claimedAt: null,
        claimedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new NextRequest('http://localhost:3000/api/cron/sync-sheets', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test_cron_secret_min_32_chars_long!',
        },
      });

      const res = await cronHandler(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.processed, 1);
      assert.equal(json.succeeded, 1);
      assert.equal(json.failed, 0);
    });
  });

  describe('Manual Retry Endpoint (POST /api/sync/sheets/retry/[id])', () => {
    test('should reject unauthenticated request with 401 Unauthorized', async () => {
      const req = new NextRequest(`http://localhost:3000/api/sync/sheets/retry/${sampleExpense.id}`, {
        method: 'POST',
      });

      const res = await manualRetryHandler(req, {
        params: Promise.resolve({ id: sampleExpense.id }),
      });
      assert.equal(res.status, 401);
    });

    test('should reject STAFF role with 403 Forbidden', async () => {
      const staffToken = await createSessionToken({
        id: mockStaff.id,
        name: mockStaff.name,
        phoneNumber: mockStaff.phoneNumber,
        role: StaffRole.STAFF,
      });

      const req = new NextRequest(`http://localhost:3000/api/sync/sheets/retry/${sampleExpense.id}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${staffToken}`,
        },
      });

      const res = await manualRetryHandler(req, {
        params: Promise.resolve({ id: sampleExpense.id }),
      });
      assert.equal(res.status, 403);
    });

    test('should allow FINANCE and ADMIN roles to manually retry sync and log SHEETS_MANUAL_RETRY', async () => {
      googleSheetsClient._clearMock();

      const financeToken = await createSessionToken({
        id: mockFinance.id,
        name: mockFinance.name,
        phoneNumber: mockFinance.phoneNumber,
        role: StaffRole.FINANCE,
      });

      const req = new NextRequest(`http://localhost:3000/api/sync/sheets/retry/${sampleExpense.id}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${financeToken}`,
        },
      });

      const res = await manualRetryHandler(req, {
        params: Promise.resolve({ id: sampleExpense.id }),
      });
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.error, null);
      assert.equal(json.data.syncedToSheet, true);

      // Verify audit log
      assert.ok(
        inMemoryAuditLogs.some((l) => l.action === AuditAction.SHEETS_MANUAL_RETRY)
      );
    });

    test('should return 404 for nonexistent expense ID on manual retry', async () => {
      const adminToken = await createSessionToken({
        id: mockAdmin.id,
        name: mockAdmin.name,
        phoneNumber: mockAdmin.phoneNumber,
        role: StaffRole.ADMIN,
      });

      const req = new NextRequest(`http://localhost:3000/api/sync/sheets/retry/nonexistent-id`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      const res = await manualRetryHandler(req, {
        params: Promise.resolve({ id: 'nonexistent-id' }),
      });
      assert.equal(res.status, 404);
    });
  });

  describe('Error Classification & Secret Sanitization', () => {
    test('should classify Google API HTTP errors properly', () => {
      const err401 = new Error('invalid_grant: Invalid credentials or token expired');
      assert.equal(mapSheetsError(err401).code, 'SHEETS_AUTH_ERROR');

      const err403 = new Error('403 Forbidden: The caller does not have permission');
      assert.equal(mapSheetsError(err403).code, 'SHEETS_PERMISSION_DENIED');

      const err404 = new Error('404 Not Found: Requested entity was not found');
      assert.equal(mapSheetsError(err404).code, 'SHEETS_NOT_FOUND');

      const err429 = new Error('429 Too Many Requests: Quota exceeded for read/write requests');
      assert.equal(mapSheetsError(err429).code, 'SHEETS_RATE_LIMIT');

      const err503 = new Error('503 Service Unavailable: Backend error');
      assert.equal(mapSheetsError(err503).code, 'SHEETS_SERVICE_UNAVAILABLE');

      const errTimeout = new Error('The operation was aborted due to timeout');
      assert.equal(mapSheetsError(errTimeout).code, 'SHEETS_TIMEOUT');
    });

    test('should sanitize and redact service account private keys and bearer tokens from error messages', () => {
      const rawError = 'Failed to connect: -----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY----- token ya29.a0AfH6S_SAMPLE_TOKEN';
      const clean = sanitizeSheetsErrorMessage(rawError);

      assert.ok(!clean.includes('MIIEowIBAAKCAQEA0'));
      assert.ok(!clean.includes('ya29.a0AfH6S_SAMPLE_TOKEN'));
      assert.ok(clean.includes('[REDACTED_PRIVATE_KEY]'));
      assert.ok(clean.includes('[REDACTED_GOOGLE_TOKEN]'));
    });
  });
});

import crypto from 'crypto';
import { expenseRepository, ExpenseWithRelations } from '../repositories/expense.repository';
import { syncFailureRepository } from '../repositories/sync-failure.repository';
import { auditRepository } from '../repositories/audit.repository';
import { googleSheetsClient, mapSheetsError } from '../lib/google-sheets';
import { Actor } from '../lib/auth/authorization';
import { AuditAction } from '../app/generated/prisma/client';
import prisma from '../lib/db/prisma';

export interface SyncExpenseResult {
  success: boolean;
  operation?: 'APPEND' | 'UPDATE';
  sheetRowId?: string | null;
  error?: string;
  errorCode?: string;
  attemptCount?: number;
  nextRetryAt?: Date | null;
}

export interface CronSyncSummary {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

/**
 * Calculates next retry timestamp using strict exponential backoff policy:
 * - Attempt 1: +1 minute
 * - Attempt 2: +5 minutes
 * - Attempt 3: +15 minutes
 * - Attempt 4: +1 hour
 * - Attempt 5: +4 hours
 * - Attempt > 5: null (permanently failed / requires manual intervention)
 */
export function calculateNextRetry(
  attempt: number,
  now = new Date()
): { nextRetryAt: Date | null; isMaxExceeded: boolean } {
  if (attempt >= 5) {
    return { nextRetryAt: null, isMaxExceeded: true };
  }

  const intervalsMs = [
    1 * 60 * 1000,       // Attempt 1: 1 min
    5 * 60 * 1000,       // Attempt 2: 5 min
    15 * 60 * 1000,      // Attempt 3: 15 min
    60 * 60 * 1000,      // Attempt 4: 1 hour
    4 * 60 * 60 * 1000,  // Attempt 5: 4 hours
  ];

  const delayMs = intervalsMs[attempt] || 4 * 60 * 60 * 1000;
  return {
    nextRetryAt: new Date(now.getTime() + delayMs),
    isMaxExceeded: false,
  };
}

/**
 * Deterministically maps an Expense entity into Google Sheets row column values.
 */
export function mapExpenseToSheetRow(expense: ExpenseWithRelations): (string | number | null)[] {
  const transactionDateStr = expense.transactionDate instanceof Date
    ? expense.transactionDate.toISOString().split('T')[0]
    : String(expense.transactionDate);

  const staffName = expense.staff ? `${expense.staff.name} (${expense.staff.phoneNumber})` : 'Unknown Staff';
  const categoryName = expense.category ? expense.category.name : 'Belum Terklasifikasi';
  const confidenceStr = expense.confidenceScore
    ? `${Math.round(Number(expense.confidenceScore) * 100)}%`
    : '-';

  return [
    expense.id,
    transactionDateStr,
    expense.merchant,
    Number(expense.amount),
    categoryName,
    expense.notes || '',
    expense.status,
    staffName,
    confidenceStr,
    expense.createdAt.toISOString(),
    expense.updatedAt.toISOString(),
  ];
}

export class SheetsSyncService {
  /**
   * Idempotently synchronizes a single confirmed Expense record to Google Sheets.
   * If the Expense ID already exists in the sheet, it is updated in-place; otherwise appended.
   */
  async syncExpense(
    expenseId: string,
    options: { isManualRetry?: boolean; actor?: Actor; isCronRetry?: boolean } = {}
  ): Promise<SyncExpenseResult> {
    const expense = await expenseRepository.findById(expenseId);
    if (!expense) {
      return {
        success: false,
        error: `Expense "${expenseId}" not found in Neon database`,
        errorCode: 'NOT_FOUND',
      };
    }

    const config = googleSheetsClient.getConfig();
    const isMock = googleSheetsClient.isMock();

    try {
      let operation: 'APPEND' | 'UPDATE' = 'APPEND';
      let sheetRowId: string | null = null;
      const mappedRow = mapExpenseToSheetRow(expense);

      if (isMock) {
        // Mock execution for automated tests or local development without credentials
        const findResult = await googleSheetsClient.findRowByExpenseId(
          config || {
            spreadsheetId: 'mock_sheet_id',
            sheetName: 'Sheet1',
            clientEmail: 'mock@inland.iam.gserviceaccount.com',
            privateKey: 'mock_key',
          },
          expense.id
        );

        if (findResult.found && findResult.rowIndex) {
          await googleSheetsClient.updateRow(
            config || {
              spreadsheetId: 'mock_sheet_id',
              sheetName: 'Sheet1',
              clientEmail: 'mock@inland.iam.gserviceaccount.com',
              privateKey: 'mock_key',
            },
            findResult.rowIndex,
            mappedRow
          );
          operation = 'UPDATE';
          sheetRowId = `row_${findResult.rowIndex}`;
        } else {
          const appendRes = await googleSheetsClient.appendRow(
            config || {
              spreadsheetId: 'mock_sheet_id',
              sheetName: 'Sheet1',
              clientEmail: 'mock@inland.iam.gserviceaccount.com',
              privateKey: 'mock_key',
            },
            mappedRow
          );
          operation = 'APPEND';
          sheetRowId = appendRes.rowIndex ? `row_${appendRes.rowIndex}` : `row_${Date.now()}`;
        }
      } else {
        // Live Google Sheets API execution
        const targetConfig = config!;
        const findResult = await googleSheetsClient.findRowByExpenseId(targetConfig, expense.id);

        if (findResult.found && findResult.rowIndex) {
          await googleSheetsClient.updateRow(targetConfig, findResult.rowIndex, mappedRow);
          operation = 'UPDATE';
          sheetRowId = `row_${findResult.rowIndex}`;
        } else {
          const appendRes = await googleSheetsClient.appendRow(targetConfig, mappedRow);
          operation = 'APPEND';
          sheetRowId = appendRes.rowIndex ? `row_${appendRes.rowIndex}` : null;
        }
      }

      // 1. Mark Expense as synchronized in Neon
      await prisma.expense.update({
        where: { id: expense.id },
        data: {
          syncedToSheet: true,
          sheetRowId: sheetRowId || expense.sheetRowId,
        },
      });

      // 2. Resolve any existing SyncFailure record
      await syncFailureRepository.markResolved(expense.id);

      // 3. Record AuditLog entry
      let auditAction: AuditAction = AuditAction.SHEETS_SYNCED;
      if (options.isManualRetry) {
        auditAction = AuditAction.SHEETS_MANUAL_RETRY;
      } else if (options.isCronRetry) {
        auditAction = AuditAction.SHEETS_RETRY;
      }

      const actorPhone = options.actor?.phoneNumber || expense.staff?.phoneNumber || 'system';
      await auditRepository.create({
        expenseId: expense.id,
        action: auditAction,
        actorPhone,
        newValue: {
          syncedToSheet: true,
          operation,
          sheetRowId,
          timestamp: new Date().toISOString(),
        },
      });

      return {
        success: true,
        operation,
        sheetRowId,
      };
    } catch (err) {
      const mappedError = mapSheetsError(err);
      console.error(`[Sheets Sync Error for Expense ${expense.id}]:`, mappedError.message);

      // Fetch existing failure record to calculate incremented attempt count
      const existingFailure = await syncFailureRepository.findByExpenseId(expense.id);
      const attemptCount = (existingFailure?.attemptCount || 0) + 1;
      const { nextRetryAt, isMaxExceeded } = calculateNextRetry(attemptCount);

      // 1. Ensure Expense is marked un-synced in Neon
      await prisma.expense.update({
        where: { id: expense.id },
        data: {
          syncedToSheet: false,
        },
      });

      // 2. Persist durable SyncFailure in Neon
      await syncFailureRepository.upsertFailure({
        expenseId: expense.id,
        errorCode: mappedError.code,
        errorMessage: mappedError.message,
        attemptCount,
        nextRetryAt,
        lastAttemptAt: new Date(),
        resolved: false,
      });

      // 3. Record AuditLog entry for failure
      const actorPhone = options.actor?.phoneNumber || 'system';
      await auditRepository.create({
        expenseId: expense.id,
        action: AuditAction.SHEETS_SYNC_FAILED,
        actorPhone,
        newValue: {
          syncedToSheet: false,
          error: mappedError.message,
          errorCode: mappedError.code,
          attemptCount,
          nextRetryAt: nextRetryAt?.toISOString() || null,
          maxAttemptsExceeded: isMaxExceeded,
        },
      });

      return {
        success: false,
        error: mappedError.message,
        errorCode: mappedError.code,
        attemptCount,
        nextRetryAt,
      };
    }
  }

  /**
   * Processes a bounded batch of due SyncFailure records for Vercel Cron worker.
   */
  async processDueSyncFailures(batchSize = 20): Promise<CronSyncSummary> {
    const workerId = `cron-${crypto.randomUUID()}`;
    const claimedFailures = await syncFailureRepository.claimDueForRetry(batchSize, workerId);

    if (!claimedFailures.length) {
      return {
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
      };
    }

    let succeeded = 0;
    let failed = 0;

    for (const failure of claimedFailures) {
      try {
        const result = await this.syncExpense(failure.expenseId, { isCronRetry: true });
        if (result.success) {
          succeeded++;
        } else {
          failed++;
        }
      } catch (err) {
        console.error(`[Cron Worker Failure for Expense ${failure.expenseId}]:`, err);
        failed++;
        // Release lock in case of unexpected exception
        await syncFailureRepository.releaseClaim(failure.expenseId);
      }
    }

    return {
      processed: claimedFailures.length,
      succeeded,
      failed,
      skipped: 0,
    };
  }
}

export const sheetsSyncService = new SheetsSyncService();

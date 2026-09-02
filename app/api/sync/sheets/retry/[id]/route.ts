import { NextRequest } from 'next/server';
import { getActorFromRequest } from '@/lib/auth/context';
import { requireRole, Permissions, assertCanAccessExpense } from '@/lib/auth/authorization';
import { expenseRepository } from '@/repositories/expense.repository';
import { sheetsSyncService } from '@/services/sheets-sync.service';
import { apiResponse, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * Authenticated Manual Google Sheets Retry Endpoint.
 * 
 * Invocation:
 *   POST /api/sync/sheets/retry/[id]
 * 
 * Authorization:
 *   - ADMIN or FINANCE role only (STAFF -> 403 Forbidden)
 *   - IDOR protection: verified against existing expense record
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getActorFromRequest(req);
    const { id } = await params;

    // RBAC: Only Admin and Finance roles can trigger manual Sheets synchronization retry
    requireRole(actor, Permissions.REVIEW_EXPENSE);

    // Verify Expense existence and IDOR boundaries
    const expense = await expenseRepository.findById(id);
    if (!expense) {
      throw new NotFoundError('Expense');
    }
    assertCanAccessExpense(actor, expense.staffId);

    // Execute idempotent sync
    const syncResult = await sheetsSyncService.syncExpense(id, {
      isManualRetry: true,
      actor,
    });

    if (!syncResult.success) {
      return apiResponse.error(
        syncResult.error || 'Failed to synchronize expense to Google Sheets',
        syncResult.errorCode || 'SHEETS_SYNC_FAILED',
        502,
        {
          attemptCount: syncResult.attemptCount,
          nextRetryAt: syncResult.nextRetryAt,
        }
      );
    }

    return apiResponse.success({
      message: 'Expense successfully synchronized to Google Sheets',
      expenseId: id,
      operation: syncResult.operation,
      sheetRowId: syncResult.sheetRowId,
      syncedToSheet: true,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

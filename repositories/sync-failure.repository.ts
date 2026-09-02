import prisma from '../lib/db/prisma';
import { SyncFailure, Prisma } from '../app/generated/prisma/client';

export interface UpsertSyncFailureParams {
  expenseId: string;
  errorCode?: string;
  errorMessage: string;
  attemptCount: number;
  nextRetryAt?: Date | null;
  lastAttemptAt?: Date;
  resolved?: boolean;
  resolvedAt?: Date | null;
}

export class SyncFailureRepository {
  async findByExpenseId(expenseId: string): Promise<SyncFailure | null> {
    return prisma.syncFailure.findUnique({
      where: { expenseId },
    });
  }

  async upsertFailure(params: UpsertSyncFailureParams): Promise<SyncFailure> {
    const now = new Date();
    const lastAttemptAt = params.lastAttemptAt || now;

    return prisma.syncFailure.upsert({
      where: { expenseId: params.expenseId },
      create: {
        expenseId: params.expenseId,
        errorCode: params.errorCode ?? null,
        lastError: params.errorMessage,
        attemptCount: params.attemptCount,
        nextRetryAt: params.nextRetryAt ?? null,
        lastAttemptAt,
        resolved: params.resolved ?? false,
        resolvedAt: params.resolvedAt ?? null,
        claimedAt: null,
        claimedBy: null,
      },
      update: {
        errorCode: params.errorCode ?? null,
        lastError: params.errorMessage,
        attemptCount: params.attemptCount,
        nextRetryAt: params.nextRetryAt ?? null,
        lastAttemptAt,
        resolved: params.resolved ?? false,
        resolvedAt: params.resolvedAt ?? null,
        claimedAt: null,
        claimedBy: null,
      },
    });
  }

  /**
   * Atomically claims a bounded batch of due sync failures to prevent duplicate processing by concurrent cron workers.
   */
  async claimDueForRetry(
    batchSize = 20,
    workerId: string,
    now = new Date(),
    lockDurationMs = 5 * 60 * 1000 // 5 minutes stale lock recovery
  ): Promise<SyncFailure[]> {
    const staleThreshold = new Date(now.getTime() - lockDurationMs);

    return prisma.$transaction(async (tx) => {
      // Find candidate IDs that are due and not currently locked
      const candidates = await tx.syncFailure.findMany({
        where: {
          resolved: false,
          attemptCount: { lte: 5 },
          OR: [
            { nextRetryAt: null },
            { nextRetryAt: { lte: now } },
          ],
          AND: [
            {
              OR: [
                { claimedAt: null },
                { claimedAt: { lte: staleThreshold } },
              ],
            },
          ],
        },
        take: batchSize,
        orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }],
      });

      if (!candidates.length) {
        return [];
      }

      const candidateIds = candidates.map((c) => c.id);

      // Lock them with the workerId
      await tx.syncFailure.updateMany({
        where: {
          id: { in: candidateIds },
        },
        data: {
          claimedAt: now,
          claimedBy: workerId,
        },
      });

      // Return refreshed claimed records
      return tx.syncFailure.findMany({
        where: { id: { in: candidateIds } },
        include: { expense: true },
      });
    });
  }

  async markResolved(expenseId: string): Promise<SyncFailure | null> {
    try {
      return await prisma.syncFailure.update({
        where: { expenseId },
        data: {
          resolved: true,
          resolvedAt: new Date(),
          nextRetryAt: null,
          claimedAt: null,
          claimedBy: null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025' // Record not found
      ) {
        return null;
      }
      throw error;
    }
  }

  async releaseClaim(expenseId: string): Promise<void> {
    try {
      await prisma.syncFailure.update({
        where: { expenseId },
        data: {
          claimedAt: null,
          claimedBy: null,
        },
      });
    } catch {
      // Ignore if record was already deleted/updated
    }
  }

  async countUnresolved(): Promise<number> {
    return prisma.syncFailure.count({
      where: { resolved: false },
    });
  }
}

export const syncFailureRepository = new SyncFailureRepository();

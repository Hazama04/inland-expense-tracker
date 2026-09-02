import { expenseRepository, ExpenseFindManyFilters, ExpenseWithRelations } from '../repositories/expense.repository';
import { staffRepository } from '../repositories/staff.repository';
import { categoryRepository } from '../repositories/category.repository';
import { auditRepository } from '../repositories/audit.repository';
import { Actor, Permissions, requireRole, assertCanAccessExpense, requireActor } from '../lib/auth/authorization';
import { CreateExpenseInput, UpdateExpenseInput } from '../lib/validation/schemas';
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from '../lib/errors';
import { ExpenseStatus, AuditAction, StaffRole, Prisma } from '../app/generated/prisma/client';
import { sheetsSyncService } from './sheets-sync.service';
import prisma from '../lib/db/prisma';

// Valid status transitions map for regular staff
const ALLOWED_STAFF_STATUS_TRANSITIONS: Record<ExpenseStatus, ExpenseStatus[]> = {
  [ExpenseStatus.AUTO]: [ExpenseStatus.DIKOREKSI_MANUAL, ExpenseStatus.PERLU_REVIEW],
  [ExpenseStatus.INPUT_MANUAL]: [ExpenseStatus.DIKOREKSI_MANUAL, ExpenseStatus.PERLU_REVIEW],
  [ExpenseStatus.DIKOREKSI_MANUAL]: [ExpenseStatus.PERLU_REVIEW],
  [ExpenseStatus.PERLU_REVIEW]: [], // Staff cannot resolve items under review; requires Finance/Admin
};

export class ExpenseService {
  /**
   * Validate whether a status transition is permitted based on business rules and actor role.
   */
  validateStatusTransition(currentStatus: ExpenseStatus, targetStatus: ExpenseStatus, actorRole: StaffRole): void {
    if (currentStatus === targetStatus) {
      return;
    }

    // Finance and Admin can override/review any status
    if (actorRole === StaffRole.ADMIN || actorRole === StaffRole.FINANCE) {
      return;
    }

    const allowed = ALLOWED_STAFF_STATUS_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(targetStatus)) {
      throw new ConflictError(
        `Invalid status transition from "${currentStatus}" to "${targetStatus}" for role "${actorRole}".`
      );
    }
  }

  async listExpenses(
    actor: Actor,
    filters: ExpenseFindManyFilters & { page?: number; pageSize?: number } = {}
  ) {
    requireRole(actor, Permissions.CREATE_EXPENSE);

    const scopedFilters: ExpenseFindManyFilters = { ...filters };

    // Staff can only view their own expenses
    if (actor.role === StaffRole.STAFF) {
      scopedFilters.staffId = actor.id;
    }

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      expenseRepository.findMany({ ...scopedFilters, skip, take: pageSize }),
      expenseRepository.count(scopedFilters),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getExpenseById(actor: Actor, id: string): Promise<ExpenseWithRelations> {
    const expense = await expenseRepository.findById(id);
    if (!expense) {
      throw new NotFoundError('Expense');
    }

    assertCanAccessExpense(actor, expense.staffId);
    return expense;
  }

  /**
   * Check if a duplicate expense exists within a recent time window (default 30 min).
   */
  async checkDuplicate(params: {
    staffId: string;
    amount: number | Prisma.Decimal;
    transactionDate: Date;
    merchant: string;
    windowMinutes?: number;
  }) {
    return expenseRepository.findRecentDuplicate(params);
  }

  /**
   * Find the most recent expense for WhatsApp conversational corrections.
   */
  async getLastExpenseForCorrection(staffId: string, windowMinutes = 30) {
    return expenseRepository.findLastByStaff(staffId, windowMinutes);
  }

  /**
   * Create an expense transaction with atomic audit logging and duplicate checking.
   */
  async createExpense(
    actor: Actor,
    input: CreateExpenseInput,
    options: { isManualInput?: boolean; allowDuplicate?: boolean } = {}
  ) {
    requireRole(actor, Permissions.CREATE_EXPENSE);

    // If actor is staff, verify staffId matches their own account
    const targetStaffId = actor.role === StaffRole.STAFF ? actor.id : input.staffId;

    const staff = await staffRepository.findById(targetStaffId);
    if (!staff || !staff.isActive) {
      throw new ValidationError('Target staff does not exist or is inactive.');
    }

    if (input.categoryId) {
      const category = await categoryRepository.findById(input.categoryId);
      if (!category || !category.isActive) {
        throw new ValidationError('Category does not exist or is inactive.');
      }
    }

    const decimalAmount = new Prisma.Decimal(input.amount);

    const result = await prisma.$transaction(async (tx) => {
      // Duplicate detection
      const duplicate = await expenseRepository.findRecentDuplicate(
        {
          staffId: targetStaffId,
          amount: decimalAmount,
          transactionDate: input.transactionDate,
          merchant: input.merchant,
          windowMinutes: 30,
        },
        tx
      );

      let finalStatus = input.status ?? ExpenseStatus.AUTO;
      if (options.isManualInput) {
        finalStatus = ExpenseStatus.INPUT_MANUAL;
      }

      if (duplicate && !options.allowDuplicate) {
        // Flag for review if duplicate suspected
        finalStatus = ExpenseStatus.PERLU_REVIEW;
      }

      const expense = await tx.expense.create({
        data: {
          staffId: targetStaffId,
          categoryId: input.categoryId ?? null,
          merchant: input.merchant.trim(),
          transactionDate: input.transactionDate,
          amount: decimalAmount,
          status: finalStatus,
          receiptImagePath: input.receiptImagePath ?? null,
          rawOcrResponse: input.rawOcrResponse ?? Prisma.JsonNull,
          confidenceScore: input.confidenceScore ? new Prisma.Decimal(input.confidenceScore) : null,
          notes: input.notes?.trim() ?? null,
          syncedToSheet: false,
        },
        include: {
          staff: true,
          category: true,
        },
      });

      // Log initial creation
      const auditAction = options.isManualInput
        ? AuditAction.MANUAL_INPUT
        : AuditAction.CREATED;

      await auditRepository.create(
        {
          expenseId: expense.id,
          action: auditAction,
          actorPhone: actor.phoneNumber,
          newValue: {
            merchant: expense.merchant,
            amount: expense.amount.toString(),
            transactionDate: expense.transactionDate,
            categoryId: expense.categoryId,
            status: expense.status,
            staffId: expense.staffId,
          },
        },
        tx
      );

      // Log duplicate flag if detected
      if (duplicate) {
        await auditRepository.create(
          {
            expenseId: expense.id,
            action: AuditAction.DUPLICATE_FLAGGED,
            actorPhone: actor.phoneNumber,
            oldValue: { duplicateOfExpenseId: duplicate.id },
            newValue: { status: ExpenseStatus.PERLU_REVIEW },
          },
          tx
        );
      }

      return expense;
    });

    // Non-blocking initial Google Sheets sync attempt after Neon transaction commits
    sheetsSyncService.syncExpense(result.id, { actor }).catch((err) => {
      console.error('[Initial Sheets Sync Error]:', err);
    });

    return result;
  }

  /**
   * Update an existing expense (e.g. category/amount correction or admin review).
   */
  async updateExpense(actor: Actor, id: string, input: UpdateExpenseInput) {
    const existing = await expenseRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Expense');
    }

    // Role check: Staff can only edit their own expense
    if (actor.role === StaffRole.STAFF && existing.staffId !== actor.id) {
      throw new ForbiddenError('You can only modify your own expense records');
    }

    if (input.categoryId) {
      const category = await categoryRepository.findById(input.categoryId);
      if (!category || !category.isActive) {
        throw new ValidationError('Category does not exist or is inactive.');
      }
    }

    // Status transition validation
    if (input.status && input.status !== existing.status) {
      this.validateStatusTransition(existing.status, input.status, actor.role);
    }

    const result = await prisma.$transaction(async (tx) => {
      const updateData: Prisma.ExpenseUncheckedUpdateInput = {};
      const oldDiff: Record<string, unknown> = {};
      const newDiff: Record<string, unknown> = {};

      if (input.merchant !== undefined && input.merchant.trim() !== existing.merchant) {
        updateData.merchant = input.merchant.trim();
        oldDiff.merchant = existing.merchant;
        newDiff.merchant = updateData.merchant;
      }

      if (input.amount !== undefined) {
        const newDecimal = new Prisma.Decimal(input.amount);
        if (!newDecimal.equals(existing.amount)) {
          updateData.amount = newDecimal;
          oldDiff.amount = existing.amount.toString();
          newDiff.amount = newDecimal.toString();
        }
      }

      if (input.transactionDate !== undefined) {
        updateData.transactionDate = input.transactionDate;
        oldDiff.transactionDate = existing.transactionDate;
        newDiff.transactionDate = input.transactionDate;
      }

      if (input.categoryId !== undefined && input.categoryId !== existing.categoryId) {
        updateData.categoryId = input.categoryId;
        oldDiff.categoryId = existing.categoryId;
        newDiff.categoryId = input.categoryId;
      }

      if (input.notes !== undefined && input.notes !== existing.notes) {
        updateData.notes = input.notes?.trim() ?? null;
        oldDiff.notes = existing.notes;
        newDiff.notes = updateData.notes;
      }

      if (input.sheetRowId !== undefined) {
        updateData.sheetRowId = input.sheetRowId;
      }

      if (input.syncedToSheet !== undefined) {
        updateData.syncedToSheet = input.syncedToSheet;
      }

      // Handle status update
      if (input.status !== undefined && input.status !== existing.status) {
        updateData.status = input.status;
        oldDiff.status = existing.status;
        newDiff.status = input.status;
      } else if (actor.role === StaffRole.STAFF && Object.keys(newDiff).length > 0) {
        // Automatic correction status if edited by staff
        updateData.status = ExpenseStatus.DIKOREKSI_MANUAL;
        oldDiff.status = existing.status;
        newDiff.status = ExpenseStatus.DIKOREKSI_MANUAL;
      }

      const updated = await tx.expense.update({
        where: { id },
        data: updateData,
        include: {
          staff: true,
          category: true,
        },
      });

      // Record audit log only if values changed
      if (Object.keys(newDiff).length > 0) {
        const action = input.status && input.status !== existing.status
          ? AuditAction.STATUS_UPDATED
          : AuditAction.CORRECTED;

        await auditRepository.create(
          {
            expenseId: updated.id,
            action,
            actorPhone: actor.phoneNumber,
            oldValue: oldDiff,
            newValue: newDiff,
          },
          tx
        );
      }

      return updated;
    });

    // Non-blocking Google Sheets sync update after Neon transaction commits
    sheetsSyncService.syncExpense(result.id, { actor }).catch((err) => {
      console.error('[Update Sheets Sync Error]:', err);
    });

    return result;
  }

  async getDashboardStats(actor: Actor) {
    requireActor(actor);
    const staffId = actor.role === StaffRole.STAFF ? actor.id : undefined;
    return expenseRepository.getDashboardAggregates(staffId);
  }
}

export const expenseService = new ExpenseService();

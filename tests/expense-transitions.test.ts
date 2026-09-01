import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ExpenseService } from '../services/expense.service';
import { ExpenseStatus, StaffRole } from '../app/generated/prisma/enums';
import { ConflictError } from '../lib/errors/index';

describe('Expense Status Transition Rules', () => {
  const expenseService = new ExpenseService();

  it('should allow staff to transition from AUTO to DIKOREKSI_MANUAL', () => {
    assert.doesNotThrow(() => {
      expenseService.validateStatusTransition(
        ExpenseStatus.AUTO,
        ExpenseStatus.DIKOREKSI_MANUAL,
        StaffRole.STAFF
      );
    });
  });

  it('should allow staff to transition from INPUT_MANUAL to DIKOREKSI_MANUAL', () => {
    assert.doesNotThrow(() => {
      expenseService.validateStatusTransition(
        ExpenseStatus.INPUT_MANUAL,
        ExpenseStatus.DIKOREKSI_MANUAL,
        StaffRole.STAFF
      );
    });
  });

  it('should allow flag to PERLU_REVIEW from any initial status', () => {
    assert.doesNotThrow(() => {
      expenseService.validateStatusTransition(
        ExpenseStatus.AUTO,
        ExpenseStatus.PERLU_REVIEW,
        StaffRole.STAFF
      );
    });
    assert.doesNotThrow(() => {
      expenseService.validateStatusTransition(
        ExpenseStatus.INPUT_MANUAL,
        ExpenseStatus.PERLU_REVIEW,
        StaffRole.STAFF
      );
    });
    assert.doesNotThrow(() => {
      expenseService.validateStatusTransition(
        ExpenseStatus.DIKOREKSI_MANUAL,
        ExpenseStatus.PERLU_REVIEW,
        StaffRole.STAFF
      );
    });
  });

  it('should reject invalid direct transitions by regular staff', () => {
    // Staff cannot arbitrarily transition back to AUTO or INPUT_MANUAL from PERLU_REVIEW
    assert.throws(() => {
      expenseService.validateStatusTransition(
        ExpenseStatus.PERLU_REVIEW,
        ExpenseStatus.AUTO,
        StaffRole.STAFF
      );
    }, ConflictError);
  });

  it('should allow Admin and Finance to override any status transition', () => {
    assert.doesNotThrow(() => {
      expenseService.validateStatusTransition(
        ExpenseStatus.PERLU_REVIEW,
        ExpenseStatus.AUTO,
        StaffRole.FINANCE
      );
    });
    assert.doesNotThrow(() => {
      expenseService.validateStatusTransition(
        ExpenseStatus.PERLU_REVIEW,
        ExpenseStatus.AUTO,
        StaffRole.ADMIN
      );
    });
  });
});

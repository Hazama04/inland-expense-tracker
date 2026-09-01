import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createStaffSchema,
  createCategorySchema,
  createExpenseSchema,
  updateExpenseSchema,
} from '../lib/validation/schemas';
import { StaffRole, ExpenseStatus } from '../app/generated/prisma/enums';

describe('Zod Input Validation Schemas', () => {
  it('should validate and normalize valid createStaff input', () => {
    const valid = createStaffSchema.parse({
      name: 'Gilang Prasetya',
      phoneNumber: '081234567890',
      role: StaffRole.STAFF,
      isActive: true,
    });

    assert.strictEqual(valid.name, 'Gilang Prasetya');
    assert.strictEqual(valid.phoneNumber, '+6281234567890');
    assert.strictEqual(valid.role, StaffRole.STAFF);
    assert.strictEqual(valid.isActive, true);
  });

  it('should reject invalid phone numbers in createStaff', () => {
    assert.throws(() => {
      createStaffSchema.parse({
        name: 'Gilang',
        phoneNumber: 'not-a-number',
      });
    });
  });

  it('should validate category creation with trimmed keywords', () => {
    const valid = createCategorySchema.parse({
      name: '  ATK & Perlengkapan  ',
      keywords: [' kertas ', 'pulpen', 'Buku '],
    });

    assert.strictEqual(valid.name, 'ATK & Perlengkapan');
    assert.deepStrictEqual(valid.keywords, ['kertas', 'pulpen', 'Buku']);
  });

  it('should validate and transform expense creation payload', () => {
    const valid = createExpenseSchema.parse({
      staffId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      merchant: 'Indomaret Cipayung',
      transactionDate: '2026-09-01',
      amount: '145000.00',
      status: ExpenseStatus.AUTO,
      notes: 'Beli kertas HVS & spidol',
    });

    assert.strictEqual(valid.merchant, 'Indomaret Cipayung');
    assert.strictEqual(valid.amount, 145000);
    assert(valid.transactionDate instanceof Date);
    assert.strictEqual(valid.status, ExpenseStatus.AUTO);
  });

  it('should reject negative or zero amounts in expense', () => {
    assert.throws(() => {
      createExpenseSchema.parse({
        staffId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        merchant: 'Indomaret',
        transactionDate: '2026-09-01',
        amount: -5000,
      });
    });

    assert.throws(() => {
      createExpenseSchema.parse({
        staffId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        merchant: 'Indomaret',
        transactionDate: '2026-09-01',
        amount: 0,
      });
    });
  });

  it('should validate partial updates in updateExpenseSchema', () => {
    const partial = updateExpenseSchema.parse({
      amount: 150000,
      notes: 'Revisi nominal struk',
    });

    assert.strictEqual(partial.amount, 150000);
    assert.strictEqual(partial.notes, 'Revisi nominal struk');
    assert.strictEqual(partial.merchant, undefined);
  });
});

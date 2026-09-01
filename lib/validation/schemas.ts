import { z } from 'zod';
import { StaffRole, ExpenseStatus, AuditAction } from '../../app/generated/prisma/client';
import { normalizePhoneNumber } from '../phone';

// Custom validator for phone number
const phoneSchema = z.string().trim().refine(
  (val) => {
    try {
      normalizePhoneNumber(val);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Invalid phone number format. Must be a valid Indonesian phone number (e.g. +6281234567890).' }
).transform((val) => normalizePhoneNumber(val));

// Custom validator for positive monetary amount
const amountSchema = z.union([
  z.number().positive('Amount must be greater than zero').max(999_999_999_999.99, 'Amount exceeds maximum limit'),
  z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a valid number format').refine(
    (val) => parseFloat(val) > 0,
    { message: 'Amount must be greater than zero' }
  ),
]).transform((val) => typeof val === 'string' ? parseFloat(val) : val);

// Date string validator (YYYY-MM-DD or ISO)
const dateSchema = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Invalid date format. Expected YYYY-MM-DD').transform((val) => new Date(val)),
  z.date(),
]);

// ==========================================
// Authentication Schemas
// ==========================================
export const createSessionSchema = z.object({
  phoneNumber: phoneSchema,
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

// ==========================================
// Staff Schemas
// ==========================================
export const createStaffSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name must be at most 100 characters'),
  phoneNumber: phoneSchema,
  role: z.nativeEnum(StaffRole).default(StaffRole.STAFF),
  isActive: z.boolean().default(true),
});

export const updateStaffSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name must be at most 100 characters').optional(),
  phoneNumber: phoneSchema.optional(),
  role: z.nativeEnum(StaffRole).optional(),
  isActive: z.boolean().optional(),
});

export const staffFilterSchema = z.object({
  role: z.nativeEnum(StaffRole).optional(),
  isActive: z.preprocess((val) => (val === 'true' ? true : val === 'false' ? false : val), z.boolean().optional()),
  search: z.string().trim().optional(),
  page: z.preprocess((val) => parseInt(String(val), 10) || 1, z.number().int().min(1).default(1)),
  pageSize: z.preprocess((val) => Math.min(parseInt(String(val), 10) || 20, 100), z.number().int().min(1).max(100).default(20)),
});

// ==========================================
// Category Schemas
// ==========================================
export const createCategorySchema = z.object({
  name: z.string().trim().min(2, 'Category name must be at least 2 characters').max(50, 'Category name must be at most 50 characters'),
  keywords: z.array(z.string().trim().min(1)).default([]),
  isActive: z.boolean().default(true),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(2, 'Category name must be at least 2 characters').max(50, 'Category name must be at most 50 characters').optional(),
  keywords: z.array(z.string().trim().min(1)).optional(),
  isActive: z.boolean().optional(),
});

export const categoryFilterSchema = z.object({
  isActive: z.preprocess((val) => (val === 'true' ? true : val === 'false' ? false : val), z.boolean().optional()),
  search: z.string().trim().optional(),
  page: z.preprocess((val) => parseInt(String(val), 10) || 1, z.number().int().min(1).default(1)),
  pageSize: z.preprocess((val) => Math.min(parseInt(String(val), 10) || 50, 100), z.number().int().min(1).max(100).default(50)),
});

// ==========================================
// Expense Schemas
// ==========================================
export const createExpenseSchema = z.object({
  staffId: z.string().uuid('Invalid staff ID'),
  categoryId: z.string().uuid('Invalid category ID').optional().nullable(),
  merchant: z.string().trim().min(1, 'Merchant name is required').max(200, 'Merchant name too long'),
  transactionDate: dateSchema,
  amount: amountSchema,
  status: z.nativeEnum(ExpenseStatus).default(ExpenseStatus.AUTO),
  receiptImagePath: z.string().trim().optional().nullable(),
  rawOcrResponse: z.any().optional().nullable(),
  confidenceScore: z.number().min(0).max(1).optional().nullable(),
  notes: z.string().trim().max(500, 'Notes must not exceed 500 characters').optional().nullable(),
});

export const updateExpenseSchema = z.object({
  categoryId: z.string().uuid('Invalid category ID').optional().nullable(),
  merchant: z.string().trim().min(1, 'Merchant name is required').max(200, 'Merchant name too long').optional(),
  transactionDate: dateSchema.optional(),
  amount: amountSchema.optional(),
  status: z.nativeEnum(ExpenseStatus).optional(),
  notes: z.string().trim().max(500, 'Notes must not exceed 500 characters').optional().nullable(),
  sheetRowId: z.string().trim().optional().nullable(),
  syncedToSheet: z.boolean().optional(),
});

export const expenseFilterSchema = z.object({
  staffId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  status: z.nativeEnum(ExpenseStatus).optional(),
  syncedToSheet: z.preprocess((val) => (val === 'true' ? true : val === 'false' ? false : val), z.boolean().optional()),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).transform((val) => new Date(val)).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).transform((val) => new Date(val)).optional(),
  search: z.string().trim().optional(),
  page: z.preprocess((val) => parseInt(String(val), 10) || 1, z.number().int().min(1).default(1)),
  pageSize: z.preprocess((val) => Math.min(parseInt(String(val), 10) || 20, 100), z.number().int().min(1).max(100).default(20)),
});

// ==========================================
// Audit Log Schemas
// ==========================================
export const auditLogFilterSchema = z.object({
  expenseId: z.string().uuid().optional(),
  actorPhone: z.string().trim().optional(),
  action: z.nativeEnum(AuditAction).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).transform((val) => new Date(val)).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).transform((val) => new Date(val)).optional(),
  page: z.preprocess((val) => parseInt(String(val), 10) || 1, z.number().int().min(1).default(1)),
  pageSize: z.preprocess((val) => Math.min(parseInt(String(val), 10) || 20, 100), z.number().int().min(1).max(100).default(20)),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type StaffFilterInput = z.infer<typeof staffFilterSchema>;

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryFilterInput = z.infer<typeof categoryFilterSchema>;

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ExpenseFilterInput = z.infer<typeof expenseFilterSchema>;

export type AuditLogFilterInput = z.infer<typeof auditLogFilterSchema>;

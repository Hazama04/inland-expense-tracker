import { StaffRole } from '../../app/generated/prisma/client';
import { ForbiddenError, UnauthorizedError } from '../errors';

export interface Actor {
  id: string;
  name: string;
  phoneNumber: string;
  role: StaffRole;
  isActive: boolean;
}

export const Permissions = {
  // Staff management
  MANAGE_STAFF: [StaffRole.ADMIN],
  VIEW_STAFF: [StaffRole.ADMIN, StaffRole.FINANCE],

  // Category management
  MANAGE_CATEGORIES: [StaffRole.ADMIN],
  VIEW_CATEGORIES: [StaffRole.ADMIN, StaffRole.FINANCE, StaffRole.STAFF],

  // Expense management
  CREATE_EXPENSE: [StaffRole.ADMIN, StaffRole.FINANCE, StaffRole.STAFF],
  VIEW_ALL_EXPENSES: [StaffRole.ADMIN, StaffRole.FINANCE],
  REVIEW_EXPENSE: [StaffRole.ADMIN, StaffRole.FINANCE],
  DELETE_EXPENSE: [StaffRole.ADMIN],

  // Audit logs
  VIEW_AUDIT_LOGS: [StaffRole.ADMIN],
} as const;

export function requireActor(actor: Actor | null | undefined): Actor {
  if (!actor) {
    throw new UnauthorizedError('Authentication required');
  }
  if (!actor.isActive) {
    throw new ForbiddenError('Account is inactive or not whitelisted');
  }
  return actor;
}

export function requireRole(actor: Actor, allowedRoles: readonly StaffRole[]): void {
  requireActor(actor);
  if (!allowedRoles.includes(actor.role)) {
    throw new ForbiddenError(`Insufficient permissions for role: ${actor.role}`);
  }
}

export function canAccessExpense(actor: Actor, expenseStaffId: string): boolean {
  requireActor(actor);
  if (actor.role === StaffRole.ADMIN || actor.role === StaffRole.FINANCE) {
    return true;
  }
  return actor.id === expenseStaffId;
}

export function assertCanAccessExpense(actor: Actor, expenseStaffId: string): void {
  if (!canAccessExpense(actor, expenseStaffId)) {
    throw new ForbiddenError('You can only access your own expense records');
  }
}

export function canModifyExpense(actor: Actor, expenseStaffId: string): boolean {
  requireActor(actor);
  if (actor.role === StaffRole.ADMIN || actor.role === StaffRole.FINANCE) {
    return true;
  }
  return actor.id === expenseStaffId;
}

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  Actor,
  requireActor,
  requireRole,
  canAccessExpense,
  assertCanAccessExpense,
  Permissions,
} from '../lib/auth/authorization';
import { StaffRole } from '../app/generated/prisma/enums';
import { ForbiddenError, UnauthorizedError } from '../lib/errors/index';

describe('Authorization & Role-Based Access Control', () => {
  const staffActor: Actor = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Gilang Staf',
    phoneNumber: '+6281234567890',
    role: StaffRole.STAFF,
    isActive: true,
  };

  const financeActor: Actor = {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Dewi Finance',
    phoneNumber: '+6281234567891',
    role: StaffRole.FINANCE,
    isActive: true,
  };

  const adminActor: Actor = {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Admin Inland',
    phoneNumber: '+6281234567892',
    role: StaffRole.ADMIN,
    isActive: true,
  };

  const inactiveActor: Actor = {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'Resigned Staff',
    phoneNumber: '+6281234567893',
    role: StaffRole.STAFF,
    isActive: false,
  };

  it('should allow active actors and reject missing or inactive actors', () => {
    assert.strictEqual(requireActor(staffActor), staffActor);
    assert.throws(() => requireActor(null), UnauthorizedError);
    assert.throws(() => requireActor(undefined), UnauthorizedError);
    assert.throws(() => requireActor(inactiveActor), ForbiddenError);
  });

  it('should enforce role restrictions for staff management', () => {
    // Only ADMIN can manage staff
    assert.doesNotThrow(() => requireRole(adminActor, Permissions.MANAGE_STAFF));
    assert.throws(() => requireRole(financeActor, Permissions.MANAGE_STAFF), ForbiddenError);
    assert.throws(() => requireRole(staffActor, Permissions.MANAGE_STAFF), ForbiddenError);
  });

  it('should enforce role restrictions for category management', () => {
    // Only ADMIN can manage categories
    assert.doesNotThrow(() => requireRole(adminActor, Permissions.MANAGE_CATEGORIES));
    assert.throws(() => requireRole(financeActor, Permissions.MANAGE_CATEGORIES), ForbiddenError);
    assert.throws(() => requireRole(staffActor, Permissions.MANAGE_CATEGORIES), ForbiddenError);
  });

  it('should allow all active roles to view categories', () => {
    assert.doesNotThrow(() => requireRole(adminActor, Permissions.VIEW_CATEGORIES));
    assert.doesNotThrow(() => requireRole(financeActor, Permissions.VIEW_CATEGORIES));
    assert.doesNotThrow(() => requireRole(staffActor, Permissions.VIEW_CATEGORIES));
  });

  it('should correctly scope expense access', () => {
    const ownExpenseStaffId = staffActor.id;
    const otherExpenseStaffId = '99999999-9999-9999-9999-999999999999';

    // Staff can access their own, but not others
    assert.strictEqual(canAccessExpense(staffActor, ownExpenseStaffId), true);
    assert.strictEqual(canAccessExpense(staffActor, otherExpenseStaffId), false);
    assert.throws(() => assertCanAccessExpense(staffActor, otherExpenseStaffId), ForbiddenError);

    // Finance and Admin can access any expense
    assert.strictEqual(canAccessExpense(financeActor, otherExpenseStaffId), true);
    assert.strictEqual(canAccessExpense(adminActor, otherExpenseStaffId), true);
  });
});

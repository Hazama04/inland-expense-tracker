import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { createSessionToken, verifySessionToken } from '../lib/auth/token';
import { getActorFromRequest } from '../lib/auth/context';
import { SESSION_COOKIE_NAME } from '../lib/auth/session';
import { Staff, StaffRole } from '../app/generated/prisma/client';
import { UnauthorizedError, ForbiddenError } from '../lib/errors/index';
import { staffRepository } from '../repositories/staff.repository';
import { Actor, canAccessExpense, requireRole, Permissions } from '../lib/auth/authorization';

describe('Security & Authentication Hardening', () => {
  const activeStaff = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    name: 'Gilang Staf',
    phoneNumber: '+6281234567890',
    role: StaffRole.STAFF,
    isActive: true,
  };

  const activeFinance = {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    name: 'Dewi Finance',
    phoneNumber: '+6281234567891',
    role: StaffRole.FINANCE,
    isActive: true,
  };

  const activeAdmin = {
    id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    name: 'Admin Inland',
    phoneNumber: '+6281234567892',
    role: StaffRole.ADMIN,
    isActive: true,
  };

  const inactiveStaff = {
    id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
    name: 'Inactive Ex-Staff',
    phoneNumber: '+6281234567893',
    role: StaffRole.STAFF,
    isActive: false,
  };

  const staffRecords: Staff[] = [
    {
      ...activeStaff,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      ...activeFinance,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      ...activeAdmin,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      ...inactiveStaff,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  staffRepository.findById = async (id: string): Promise<Staff | null> => {
    return staffRecords.find((s) => s.id === id) ?? null;
  };

  staffRepository.findActiveByPhone = async (phone: string): Promise<Staff | null> => {
    return staffRecords.find((s) => s.phoneNumber === phone && s.isActive) ?? null;
  };

  describe('JWT Token Verification', () => {
    it('should generate and verify valid signed JWT session tokens', async () => {
      const token = await createSessionToken(activeStaff);
      assert.strictEqual(typeof token, 'string');

      const payload = await verifySessionToken(token);
      assert(payload !== null);
      assert.strictEqual(payload?.sub, activeStaff.id);
      assert.strictEqual(payload?.phoneNumber, activeStaff.phoneNumber);
      assert.strictEqual(payload?.role, StaffRole.STAFF);
    });

    it('should reject tampered JWT tokens', async () => {
      const token = await createSessionToken(activeStaff);
      const tampered = token.slice(0, -5) + 'AAAAA';

      const payload = await verifySessionToken(tampered);
      assert.strictEqual(payload, null);
    });

    it('should reject expired JWT tokens', async () => {
      // Create token that expired 1 second ago
      const expiredToken = await createSessionToken(activeStaff, '-1s');
      const payload = await verifySessionToken(expiredToken);
      assert.strictEqual(payload, null);
    });
  });

  describe('Request Authentication Context Boundary', () => {
    it('should reject unauthenticated requests with 401 UnauthorizedError', async () => {
      const req = new NextRequest('http://localhost:3000/api/expenses');
      await assert.rejects(async () => {
        await getActorFromRequest(req);
      }, UnauthorizedError);
    });

    it('should accept valid Bearer Authorization header', async () => {
      const token = await createSessionToken(activeStaff);
      const req = new NextRequest('http://localhost:3000/api/expenses', {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const actor = await getActorFromRequest(req);
      assert.strictEqual(actor.id, activeStaff.id);
      assert.strictEqual(actor.role, StaffRole.STAFF);
      assert.strictEqual(actor.isActive, true);
    });

    it('should accept valid HttpOnly session cookie', async () => {
      const token = await createSessionToken(activeFinance);
      const req = new NextRequest('http://localhost:3000/api/expenses', {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });

      const actor = await getActorFromRequest(req);
      assert.strictEqual(actor.id, activeFinance.id);
      assert.strictEqual(actor.role, StaffRole.FINANCE);
    });

    it('should reject inactive staff even if token is structurally valid', async () => {
      const token = await createSessionToken(inactiveStaff);
      const req = new NextRequest('http://localhost:3000/api/expenses', {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      await assert.rejects(async () => {
        await getActorFromRequest(req);
      }, ForbiddenError);
    });
  });

  describe('Development Header Auth Isolation & Production Fail-Closed', () => {
    it('should strictly reject development headers when NODE_ENV is production', async () => {
      const origEnv = process.env.NODE_ENV;
      const origFlag = process.env.ALLOW_DEV_ACTOR_HEADER;

      try {
        (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';
        process.env.ALLOW_DEV_ACTOR_HEADER = 'true';

        const req = new NextRequest('http://localhost:3000/api/expenses', {
          headers: {
            'x-actor-phone': activeAdmin.phoneNumber,
          },
        });

        await assert.rejects(async () => {
          await getActorFromRequest(req);
        }, UnauthorizedError);
      } finally {
        (process.env as Record<string, string | undefined>)['NODE_ENV'] = origEnv;
        process.env.ALLOW_DEV_ACTOR_HEADER = origFlag;
      }
    });

    it('should reject development headers when ALLOW_DEV_ACTOR_HEADER is not set', async () => {
      const origEnv = process.env.NODE_ENV;
      const origFlag = process.env.ALLOW_DEV_ACTOR_HEADER;

      try {
        (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'development';
        delete process.env.ALLOW_DEV_ACTOR_HEADER;

        const req = new NextRequest('http://localhost:3000/api/expenses', {
          headers: {
            'x-actor-phone': activeAdmin.phoneNumber,
          },
        });

        await assert.rejects(async () => {
          await getActorFromRequest(req);
        }, UnauthorizedError);
      } finally {
        (process.env as Record<string, string | undefined>)['NODE_ENV'] = origEnv;
        process.env.ALLOW_DEV_ACTOR_HEADER = origFlag;
      }
    });

    it('should allow development headers ONLY when both non-production and flag enabled', async () => {
      const origEnv = process.env.NODE_ENV;
      const origFlag = process.env.ALLOW_DEV_ACTOR_HEADER;

      try {
        (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'development';
        process.env.ALLOW_DEV_ACTOR_HEADER = 'true';

        const req = new NextRequest('http://localhost:3000/api/expenses', {
          headers: {
            'x-actor-phone': activeAdmin.phoneNumber,
          },
        });

        const actor = await getActorFromRequest(req);
        assert.strictEqual(actor.id, activeAdmin.id);
        assert.strictEqual(actor.role, StaffRole.ADMIN);
      } finally {
        (process.env as Record<string, string | undefined>)['NODE_ENV'] = origEnv;
        process.env.ALLOW_DEV_ACTOR_HEADER = origFlag;
      }
    });
  });

  describe('RBAC & IDOR Prevention', () => {
    it('should enforce role boundaries: staff cannot access admin routes', () => {
      const staff: Actor = { ...activeStaff };
      assert.throws(() => requireRole(staff, Permissions.MANAGE_STAFF), ForbiddenError);
      assert.throws(() => requireRole(staff, Permissions.MANAGE_CATEGORIES), ForbiddenError);
      assert.throws(() => requireRole(staff, Permissions.VIEW_AUDIT_LOGS), ForbiddenError);
    });

    it('should enforce role boundaries: finance can view but not manage staff', () => {
      const finance: Actor = { ...activeFinance };
      assert.doesNotThrow(() => requireRole(finance, Permissions.VIEW_STAFF));
      assert.throws(() => requireRole(finance, Permissions.MANAGE_STAFF), ForbiddenError);
    });

    it('should prevent IDOR: staff cannot access other staff expense records', () => {
      const staff1: Actor = { ...activeStaff };
      const staff2Id = '99999999-9999-4999-a999-999999999999';

      assert.strictEqual(canAccessExpense(staff1, staff1.id), true);
      assert.strictEqual(canAccessExpense(staff1, staff2Id), false);
    });

    it('should allow Finance and Admin to access any staff expense record', () => {
      const finance: Actor = { ...activeFinance };
      const admin: Actor = { ...activeAdmin };
      const randomStaffId = '99999999-9999-4999-a999-999999999999';

      assert.strictEqual(canAccessExpense(finance, randomStaffId), true);
      assert.strictEqual(canAccessExpense(admin, randomStaffId), true);
    });
  });
});

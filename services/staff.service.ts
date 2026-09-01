import { staffRepository, StaffFindManyFilters } from '../repositories/staff.repository';
import { auditRepository } from '../repositories/audit.repository';
import { Actor, Permissions, requireRole } from '../lib/auth/authorization';
import { CreateStaffInput, UpdateStaffInput } from '../lib/validation/schemas';
import { ConflictError, NotFoundError } from '../lib/errors';
import { normalizePhoneNumber } from '../lib/phone';
import { AuditAction, Staff } from '../app/generated/prisma/client';
import prisma from '../lib/db/prisma';

export class StaffService {
  async listStaff(
    actor: Actor,
    filters: StaffFindManyFilters & { page?: number; pageSize?: number } = {}
  ) {
    requireRole(actor, Permissions.VIEW_STAFF);

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      staffRepository.findMany({ ...filters, skip, take: pageSize }),
      staffRepository.count(filters),
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

  async getStaffById(actor: Actor, id: string): Promise<Staff> {
    requireRole(actor, Permissions.VIEW_STAFF);
    const staff = await staffRepository.findById(id);
    if (!staff) {
      throw new NotFoundError('Staff');
    }
    return staff;
  }

  async getStaffByPhone(phone: string): Promise<Staff | null> {
    const normalized = normalizePhoneNumber(phone);
    return staffRepository.findByPhone(normalized);
  }

  async getActiveStaffByPhone(phone: string): Promise<Staff | null> {
    const normalized = normalizePhoneNumber(phone);
    return staffRepository.findActiveByPhone(normalized);
  }

  async createStaff(actor: Actor, input: CreateStaffInput): Promise<Staff> {
    requireRole(actor, Permissions.MANAGE_STAFF);

    const normalizedPhone = normalizePhoneNumber(input.phoneNumber);

    const existing = await staffRepository.findByPhone(normalizedPhone);
    if (existing) {
      throw new ConflictError(`Staff with phone number ${normalizedPhone} already exists`);
    }

    return prisma.$transaction(async (tx) => {
      const staff = await tx.staff.create({
        data: {
          name: input.name.trim(),
          phoneNumber: normalizedPhone,
          role: input.role,
          isActive: input.isActive ?? true,
        },
      });

      await auditRepository.create(
        {
          action: AuditAction.CREATED,
          actorPhone: actor.phoneNumber,
          newValue: {
            entity: 'staff',
            staffId: staff.id,
            name: staff.name,
            phoneNumber: staff.phoneNumber,
            role: staff.role,
            isActive: staff.isActive,
          },
        },
        tx
      );

      return staff;
    });
  }

  async updateStaff(actor: Actor, id: string, input: UpdateStaffInput): Promise<Staff> {
    requireRole(actor, Permissions.MANAGE_STAFF);

    const existing = await staffRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Staff');
    }

    let normalizedPhone: string | undefined;
    if (input.phoneNumber) {
      normalizedPhone = normalizePhoneNumber(input.phoneNumber);
      if (normalizedPhone !== existing.phoneNumber) {
        const duplicate = await staffRepository.findByPhone(normalizedPhone);
        if (duplicate) {
          throw new ConflictError(`Staff with phone number ${normalizedPhone} already exists`);
        }
      }
    }

    return prisma.$transaction(async (tx) => {
      const updateData: Partial<{
        name: string;
        phoneNumber: string;
        role: typeof existing.role;
        isActive: boolean;
      }> = {};

      if (input.name !== undefined) updateData.name = input.name.trim();
      if (normalizedPhone !== undefined) updateData.phoneNumber = normalizedPhone;
      if (input.role !== undefined) updateData.role = input.role;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;

      const updated = await tx.staff.update({
        where: { id },
        data: updateData,
      });

      await auditRepository.create(
        {
          action: AuditAction.STATUS_UPDATED,
          actorPhone: actor.phoneNumber,
          oldValue: {
            name: existing.name,
            phoneNumber: existing.phoneNumber,
            role: existing.role,
            isActive: existing.isActive,
          },
          newValue: updateData,
        },
        tx
      );

      return updated;
    });
  }
}

export const staffService = new StaffService();

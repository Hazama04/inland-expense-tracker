import prisma from '../lib/db/prisma';
import { Staff, StaffRole, Prisma } from '../app/generated/prisma/client';

export interface StaffFindManyFilters {
  isActive?: boolean;
  role?: StaffRole;
  search?: string;
  skip?: number;
  take?: number;
}

export class StaffRepository {
  async findById(id: string): Promise<Staff | null> {
    return prisma.staff.findUnique({
      where: { id },
    });
  }

  async findByPhone(phoneNumber: string): Promise<Staff | null> {
    return prisma.staff.findUnique({
      where: { phoneNumber },
    });
  }

  async findActiveByPhone(phoneNumber: string): Promise<Staff | null> {
    return prisma.staff.findFirst({
      where: {
        phoneNumber,
        isActive: true,
      },
    });
  }

  async findMany(filters: StaffFindManyFilters = {}): Promise<Staff[]> {
    const where: Prisma.StaffWhereInput = {};

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.role !== undefined) {
      where.role = filters.role;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { phoneNumber: { contains: filters.search } },
      ];
    }

    return prisma.staff.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: filters.skip,
      take: filters.take,
    });
  }

  async count(filters: StaffFindManyFilters = {}): Promise<number> {
    const where: Prisma.StaffWhereInput = {};

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.role !== undefined) {
      where.role = filters.role;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { phoneNumber: { contains: filters.search } },
      ];
    }

    return prisma.staff.count({ where });
  }

  async create(data: {
    name: string;
    phoneNumber: string;
    role?: StaffRole;
    isActive?: boolean;
  }): Promise<Staff> {
    return prisma.staff.create({
      data: {
        name: data.name,
        phoneNumber: data.phoneNumber,
        role: data.role ?? StaffRole.STAFF,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      phoneNumber: string;
      role: StaffRole;
      isActive: boolean;
    }>
  ): Promise<Staff> {
    return prisma.staff.update({
      where: { id },
      data,
    });
  }
}

export const staffRepository = new StaffRepository();

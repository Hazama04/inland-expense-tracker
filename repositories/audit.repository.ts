import prisma from '../lib/db/prisma';
import { AuditLog, AuditAction, Prisma, PrismaClient } from '../app/generated/prisma/client';

export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface AuditLogFindManyFilters {
  expenseId?: string;
  actorPhone?: string;
  action?: AuditAction;
  startDate?: Date;
  endDate?: Date;
  skip?: number;
  take?: number;
}

export type AuditLogWithRelations = Prisma.AuditLogGetPayload<{
  include: {
    expense: {
      select: {
        id: true;
        merchant: true;
        amount: true;
        transactionDate: true;
        status: true;
      };
    };
  };
}>;

export class AuditRepository {
  private getClient(tx?: TransactionClient) {
    return tx ?? prisma;
  }

  async create(
    data: {
      expenseId?: string | null;
      action: AuditAction;
      actorPhone: string;
      oldValue?: unknown;
      newValue?: unknown;
    },
    tx?: TransactionClient
  ): Promise<AuditLog> {
    const client = this.getClient(tx);
    return client.auditLog.create({
      data: {
        expenseId: data.expenseId ?? null,
        action: data.action,
        actorPhone: data.actorPhone,
        oldValue: (data.oldValue as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        newValue: (data.newValue as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  }

  async findMany(filters: AuditLogFindManyFilters = {}): Promise<AuditLogWithRelations[]> {
    const where: Prisma.AuditLogWhereInput = {};

    if (filters.expenseId) {
      where.expenseId = filters.expenseId;
    }

    if (filters.actorPhone) {
      where.actorPhone = filters.actorPhone;
    }

    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    return prisma.auditLog.findMany({
      where,
      include: {
        expense: {
          select: {
            id: true,
            merchant: true,
            amount: true,
            transactionDate: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: filters.skip,
      take: filters.take,
    });
  }

  async count(filters: AuditLogFindManyFilters = {}): Promise<number> {
    const where: Prisma.AuditLogWhereInput = {};

    if (filters.expenseId) {
      where.expenseId = filters.expenseId;
    }

    if (filters.actorPhone) {
      where.actorPhone = filters.actorPhone;
    }

    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    return prisma.auditLog.count({ where });
  }
}

export const auditRepository = new AuditRepository();

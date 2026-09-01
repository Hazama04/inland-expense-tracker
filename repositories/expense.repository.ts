import prisma from '../lib/db/prisma';
import { Expense, ExpenseStatus, Prisma, PrismaClient } from '../app/generated/prisma/client';

export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface ExpenseFindManyFilters {
  staffId?: string;
  categoryId?: string;
  status?: ExpenseStatus;
  syncedToSheet?: boolean;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  skip?: number;
  take?: number;
}

export type ExpenseWithRelations = Prisma.ExpenseGetPayload<{
  include: {
    staff: true;
    category: true;
  };
}>;

export class ExpenseRepository {
  private getClient(tx?: TransactionClient) {
    return tx ?? prisma;
  }

  async findById(id: string, tx?: TransactionClient): Promise<ExpenseWithRelations | null> {
    const client = this.getClient(tx);
    return client.expense.findUnique({
      where: { id },
      include: {
        staff: true,
        category: true,
      },
    });
  }

  async findMany(filters: ExpenseFindManyFilters = {}): Promise<ExpenseWithRelations[]> {
    const where: Prisma.ExpenseWhereInput = {};

    if (filters.staffId) {
      where.staffId = filters.staffId;
    }

    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.syncedToSheet !== undefined) {
      where.syncedToSheet = filters.syncedToSheet;
    }

    if (filters.startDate || filters.endDate) {
      where.transactionDate = {};
      if (filters.startDate) {
        where.transactionDate.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.transactionDate.lte = filters.endDate;
      }
    }

    if (filters.search) {
      where.OR = [
        { merchant: { contains: filters.search, mode: 'insensitive' } },
        { notes: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return prisma.expense.findMany({
      where,
      include: {
        staff: true,
        category: true,
      },
      orderBy: { transactionDate: 'desc' },
      skip: filters.skip,
      take: filters.take,
    });
  }

  async count(filters: ExpenseFindManyFilters = {}): Promise<number> {
    const where: Prisma.ExpenseWhereInput = {};

    if (filters.staffId) {
      where.staffId = filters.staffId;
    }

    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.syncedToSheet !== undefined) {
      where.syncedToSheet = filters.syncedToSheet;
    }

    if (filters.startDate || filters.endDate) {
      where.transactionDate = {};
      if (filters.startDate) {
        where.transactionDate.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.transactionDate.lte = filters.endDate;
      }
    }

    if (filters.search) {
      where.OR = [
        { merchant: { contains: filters.search, mode: 'insensitive' } },
        { notes: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return prisma.expense.count({ where });
  }

  /**
   * Duplicate detection rule (PRD / 03-ARCHITECTURE Section 3.1 step 4e):
   * Same staff + same amount + same transaction date created within the last N minutes (default 30 min).
   */
  async findRecentDuplicate(params: {
    staffId: string;
    amount: Prisma.Decimal | number;
    transactionDate: Date;
    merchant: string;
    windowMinutes?: number;
  }, tx?: TransactionClient): Promise<Expense | null> {
    const windowMinutes = params.windowMinutes ?? 30;
    const cutoffTime = new Date(Date.now() - windowMinutes * 60 * 1000);

    const client = this.getClient(tx);

    return client.expense.findFirst({
      where: {
        staffId: params.staffId,
        amount: params.amount,
        transactionDate: params.transactionDate,
        createdAt: { gte: cutoffTime },
        merchant: {
          contains: params.merchant.trim(),
          mode: 'insensitive',
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find the last recorded expense by a staff member within a given time window (default 30 mins)
   * used for conversational corrections via WhatsApp.
   */
  async findLastByStaff(
    staffId: string,
    windowMinutes = 30,
    tx?: TransactionClient
  ): Promise<ExpenseWithRelations | null> {
    const cutoffTime = new Date(Date.now() - windowMinutes * 60 * 1000);
    const client = this.getClient(tx);

    return client.expense.findFirst({
      where: {
        staffId,
        createdAt: { gte: cutoffTime },
      },
      include: {
        staff: true,
        category: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    data: Prisma.ExpenseUncheckedCreateInput,
    tx?: TransactionClient
  ): Promise<Expense> {
    const client = this.getClient(tx);
    return client.expense.create({
      data,
    });
  }

  async update(
    id: string,
    data: Prisma.ExpenseUncheckedUpdateInput,
    tx?: TransactionClient
  ): Promise<Expense> {
    const client = this.getClient(tx);
    return client.expense.update({
      where: { id },
      data,
    });
  }
}

export const expenseRepository = new ExpenseRepository();

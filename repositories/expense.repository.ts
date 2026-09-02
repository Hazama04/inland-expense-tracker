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
  async getDashboardAggregates(staffId?: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const baseWhere: Prisma.ExpenseWhereInput = staffId ? { staffId } : {};

    // 1. Month Expenses
    const monthExpenses = await prisma.expense.findMany({
      where: {
        ...baseWhere,
        transactionDate: { gte: startOfMonth, lte: endOfMonth },
      },
      select: {
        amount: true,
        status: true,
        categoryId: true,
        category: { select: { id: true, name: true } },
      },
    });

    const monthTotal = monthExpenses.reduce((acc, curr) => acc + parseFloat(curr.amount.toString()), 0);
    const monthCount = monthExpenses.length;
    const autoCount = monthExpenses.filter((e) => e.status === ExpenseStatus.AUTO).length;
    const autoRate = monthCount > 0 ? Math.round((autoCount / monthCount) * 100) : 100;

    // Category breakdown
    const catMap = new Map<string, { id: string; name: string; amount: number; count: number }>();
    for (const exp of monthExpenses) {
      const catId = exp.categoryId || 'uncategorized';
      const catName = exp.category?.name || 'Tanpa Kategori';
      const amt = parseFloat(exp.amount.toString());

      const existing = catMap.get(catId) || { id: catId, name: catName, amount: 0, count: 0 };
      existing.amount += amt;
      existing.count += 1;
      catMap.set(catId, existing);
    }

    const categories = Array.from(catMap.values())
      .map((c) => ({
        ...c,
        percentage: monthTotal > 0 ? Math.round((c.amount / monthTotal) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // 2. Today Expenses
    const todayExpenses = await prisma.expense.findMany({
      where: {
        ...baseWhere,
        transactionDate: { gte: startOfToday, lte: endOfToday },
      },
      select: { amount: true },
    });
    const todayTotal = todayExpenses.reduce((acc, curr) => acc + parseFloat(curr.amount.toString()), 0);
    const todayCount = todayExpenses.length;

    // 3. Needs Review
    const needsReviewItems = await prisma.expense.findMany({
      where: {
        ...baseWhere,
        status: ExpenseStatus.PERLU_REVIEW,
      },
      include: {
        staff: true,
        category: true,
      },
      orderBy: { transactionDate: 'desc' },
      take: 5,
    });
    const needsReviewCount = await prisma.expense.count({
      where: {
        ...baseWhere,
        status: ExpenseStatus.PERLU_REVIEW,
      },
    });

    // 4. Daily Trend (14 days)
    const trendExpenses = await prisma.expense.findMany({
      where: {
        ...baseWhere,
        transactionDate: { gte: fourteenDaysAgo },
      },
      select: {
        transactionDate: true,
        amount: true,
      },
      orderBy: { transactionDate: 'asc' },
    });

    const trendMap = new Map<string, { date: string; label: string; amount: number; count: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const iso = d.toISOString().split('T')[0];
      const label = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(d);
      trendMap.set(iso, { date: iso, label, amount: 0, count: 0 });
    }

    for (const exp of trendExpenses) {
      const iso = new Date(exp.transactionDate).toISOString().split('T')[0];
      if (trendMap.has(iso)) {
        const item = trendMap.get(iso)!;
        item.amount += parseFloat(exp.amount.toString());
        item.count += 1;
      }
    }
    const dailyTrend = Array.from(trendMap.values());

    // 5. Recent Expenses
    const recentExpenses = await prisma.expense.findMany({
      where: baseWhere,
      include: {
        staff: true,
        category: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });

    return {
      kpi: {
        monthTotal,
        monthCount,
        todayTotal,
        todayCount,
        needsReviewCount,
        autoRate,
      },
      categories,
      dailyTrend,
      needsReviewItems,
      recentExpenses,
    };
  }
}

export const expenseRepository = new ExpenseRepository();

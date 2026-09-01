import prisma from '../lib/db/prisma';
import { Category, Prisma } from '../app/generated/prisma/client';

export interface CategoryFindManyFilters {
  isActive?: boolean;
  search?: string;
  skip?: number;
  take?: number;
}

export class CategoryRepository {
  async findById(id: string): Promise<Category | null> {
    return prisma.category.findUnique({
      where: { id },
    });
  }

  async findByName(name: string): Promise<Category | null> {
    return prisma.category.findFirst({
      where: {
        name: {
          equals: name.trim(),
          mode: 'insensitive',
        },
      },
    });
  }

  async findMany(filters: CategoryFindManyFilters = {}): Promise<Category[]> {
    const where: Prisma.CategoryWhereInput = {};

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { keywords: { has: filters.search.toLowerCase() } },
      ];
    }

    return prisma.category.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: filters.skip,
      take: filters.take,
    });
  }

  async count(filters: CategoryFindManyFilters = {}): Promise<number> {
    const where: Prisma.CategoryWhereInput = {};

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { keywords: { has: filters.search.toLowerCase() } },
      ];
    }

    return prisma.category.count({ where });
  }

  async create(data: {
    name: string;
    keywords?: string[];
    isActive?: boolean;
  }): Promise<Category> {
    return prisma.category.create({
      data: {
        name: data.name.trim(),
        keywords: data.keywords ?? [],
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      keywords: string[];
      isActive: boolean;
    }>
  ): Promise<Category> {
    return prisma.category.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.keywords ? { keywords: data.keywords } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }
}

export const categoryRepository = new CategoryRepository();

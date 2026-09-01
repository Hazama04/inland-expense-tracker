import { categoryRepository, CategoryFindManyFilters } from '../repositories/category.repository';
import { auditRepository } from '../repositories/audit.repository';
import { Actor, Permissions, requireRole } from '../lib/auth/authorization';
import { CreateCategoryInput, UpdateCategoryInput } from '../lib/validation/schemas';
import { ConflictError, NotFoundError } from '../lib/errors';
import { AuditAction, Category } from '../app/generated/prisma/client';
import prisma from '../lib/db/prisma';

export class CategoryService {
  async listCategories(
    actor: Actor,
    filters: CategoryFindManyFilters & { page?: number; pageSize?: number } = {}
  ) {
    requireRole(actor, Permissions.VIEW_CATEGORIES);

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      categoryRepository.findMany({ ...filters, skip, take: pageSize }),
      categoryRepository.count(filters),
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

  async getCategoryById(actor: Actor, id: string): Promise<Category> {
    requireRole(actor, Permissions.VIEW_CATEGORIES);
    const category = await categoryRepository.findById(id);
    if (!category) {
      throw new NotFoundError('Category');
    }
    return category;
  }

  async createCategory(actor: Actor, input: CreateCategoryInput): Promise<Category> {
    requireRole(actor, Permissions.MANAGE_CATEGORIES);

    const trimmedName = input.name.trim();
    const existing = await categoryRepository.findByName(trimmedName);
    if (existing) {
      throw new ConflictError(`Category "${trimmedName}" already exists`);
    }

    return prisma.$transaction(async (tx) => {
      const category = await tx.category.create({
        data: {
          name: trimmedName,
          keywords: input.keywords.map((k) => k.trim().toLowerCase()),
          isActive: input.isActive ?? true,
        },
      });

      await auditRepository.create(
        {
          action: AuditAction.CREATED,
          actorPhone: actor.phoneNumber,
          newValue: {
            entity: 'category',
            categoryId: category.id,
            name: category.name,
            keywords: category.keywords,
            isActive: category.isActive,
          },
        },
        tx
      );

      return category;
    });
  }

  async updateCategory(actor: Actor, id: string, input: UpdateCategoryInput): Promise<Category> {
    requireRole(actor, Permissions.MANAGE_CATEGORIES);

    const existing = await categoryRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Category');
    }

    let trimmedName: string | undefined;
    if (input.name !== undefined) {
      trimmedName = input.name.trim();
      if (trimmedName.toLowerCase() !== existing.name.toLowerCase()) {
        const duplicate = await categoryRepository.findByName(trimmedName);
        if (duplicate) {
          throw new ConflictError(`Category "${trimmedName}" already exists`);
        }
      }
    }

    return prisma.$transaction(async (tx) => {
      const updateData: Partial<{
        name: string;
        keywords: string[];
        isActive: boolean;
      }> = {};

      if (trimmedName !== undefined) updateData.name = trimmedName;
      if (input.keywords !== undefined) {
        updateData.keywords = input.keywords.map((k) => k.trim().toLowerCase());
      }
      if (input.isActive !== undefined) updateData.isActive = input.isActive;

      const updated = await tx.category.update({
        where: { id },
        data: updateData,
      });

      await auditRepository.create(
        {
          action: AuditAction.STATUS_UPDATED,
          actorPhone: actor.phoneNumber,
          oldValue: {
            name: existing.name,
            keywords: existing.keywords,
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

export const categoryService = new CategoryService();

import { NextRequest } from 'next/server';
import { categoryService } from '@/services/category.service';
import { getActorFromRequest } from '@/lib/auth/context';
import { createCategorySchema, categoryFilterSchema } from '@/lib/validation/schemas';
import { apiResponse, handleApiError } from '@/lib/api/response';

export async function GET(req: NextRequest) {
  try {
    const actor = await getActorFromRequest(req);
    const { searchParams } = new URL(req.url);

    const queryParams = Object.fromEntries(searchParams.entries());
    const validatedFilters = categoryFilterSchema.parse(queryParams);

    const result = await categoryService.listCategories(actor, validatedFilters);
    return apiResponse.success(result.items, result.meta);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getActorFromRequest(req);
    const body = await req.json();
    const validatedInput = createCategorySchema.parse(body);

    const category = await categoryService.createCategory(actor, validatedInput);
    return apiResponse.success(category, undefined, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

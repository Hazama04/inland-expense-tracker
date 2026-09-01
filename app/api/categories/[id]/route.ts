import { NextRequest } from 'next/server';
import { categoryService } from '@/services/category.service';
import { getActorFromRequest } from '@/lib/auth/context';
import { updateCategorySchema } from '@/lib/validation/schemas';
import { apiResponse, handleApiError } from '@/lib/api/response';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getActorFromRequest(req);
    const { id } = await params;

    const category = await categoryService.getCategoryById(actor, id);
    return apiResponse.success(category);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getActorFromRequest(req);
    const { id } = await params;
    const body = await req.json();
    const validatedInput = updateCategorySchema.parse(body);

    const updated = await categoryService.updateCategory(actor, id, validatedInput);
    return apiResponse.success(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

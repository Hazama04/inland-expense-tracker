import { NextRequest } from 'next/server';
import { expenseService } from '@/services/expense.service';
import { getActorFromRequest } from '@/lib/auth/context';
import { createExpenseSchema, expenseFilterSchema } from '@/lib/validation/schemas';
import { apiResponse, handleApiError } from '@/lib/api/response';

export async function GET(req: NextRequest) {
  try {
    const actor = await getActorFromRequest(req);
    const { searchParams } = new URL(req.url);

    const queryParams = Object.fromEntries(searchParams.entries());
    const validatedFilters = expenseFilterSchema.parse(queryParams);

    const result = await expenseService.listExpenses(actor, validatedFilters);
    return apiResponse.success(result.items, result.meta);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getActorFromRequest(req);
    const body = await req.json();
    const validatedInput = createExpenseSchema.parse(body);

    const expense = await expenseService.createExpense(actor, validatedInput);
    return apiResponse.success(expense, undefined, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

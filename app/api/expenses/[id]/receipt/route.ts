import { NextRequest, NextResponse } from 'next/server';
import { getActorFromRequest } from '@/lib/auth/context';
import { expenseRepository } from '@/repositories/expense.repository';
import { storageService } from '@/lib/storage';
import { assertCanAccessExpense } from '@/lib/auth/authorization';
import { AppError, NotFoundError, UnauthorizedError } from '@/lib/errors';

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate Request
    const actor = await getActorFromRequest(req);
    if (!actor) {
      throw new UnauthorizedError('Authentication required to access receipt image.');
    }

    const { id } = await props.params;

    // 2. Fetch Expense Record
    const expense = await expenseRepository.findById(id);
    if (!expense) {
      throw new NotFoundError('Expense');
    }

    // 3. Authorize Access (RBAC & IDOR Prevention)
    assertCanAccessExpense(actor, expense.staffId);

    // 4. Check if receipt image is attached
    if (!expense.receiptImagePath) {
      return NextResponse.json(
        { data: null, error: { code: 'NO_RECEIPT_IMAGE', message: 'No receipt image found for this expense' } },
        { status: 404 }
      );
    }

    // 5. Retrieve Private Blob Buffer Server-Side
    const receiptFile = await storageService.getReceipt(expense.receiptImagePath);

    // 6. Stream Bytes with Safe Response Headers
    return new NextResponse(receiptFile.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': receiptFile.contentType || 'image/jpeg',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600, no-transform',
        'Content-Disposition': `inline; filename="receipt-${id}.jpg"`,
      },
    });
  } catch (error) {
    if (error instanceof AppError || (error && typeof (error as AppError).statusCode === 'number')) {
      const appErr = error as AppError;
      return NextResponse.json(
        { data: null, error: { code: appErr.code || 'APP_ERROR', message: appErr.message } },
        { status: appErr.statusCode || 500 }
      );
    }

    console.error('[Receipt Proxy Error]:', (error as Error).message);
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } },
      { status: 500 }
    );
  }
}

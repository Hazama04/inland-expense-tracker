import { NextRequest, NextResponse } from 'next/server';
import { receiptService } from '@/services/receipt.service';
import { z } from 'zod';

const workerInputSchema = z.object({
  messageId: z.string().optional(),
  senderPhone: z.string().min(8),
  mediaUrl: z.string().url(),
  mimeType: z.string().optional(),
  fileName: z.string().optional(),
});

function verifyWorkerAuthorization(req: NextRequest): boolean {
  const workerSecret = process.env.WORKER_SECRET || process.env.AUTH_SECRET;

  if (!workerSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Worker Security Exception]: WORKER_SECRET or AUTH_SECRET is required in production.');
      return false;
    }
    return true; // Allow local testing in dev if no secret configured
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader) return false;

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  return token === workerSecret;
}

export async function POST(req: NextRequest) {
  // 1. Worker Authentication
  if (!verifyWorkerAuthorization(req)) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED_WORKER', message: 'Unauthorized worker invocation' } },
      { status: 401 }
    );
  }

  // 2. Validate Request Body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'INVALID_JSON', message: 'Unable to parse request JSON body' } },
      { status: 400 }
    );
  }

  const parsed = workerInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid receipt processing input schema', details: parsed.error.issues } },
      { status: 400 }
    );
  }

  // 3. Execute Receipt Processing Pipeline
  try {
    const result = await receiptService.processReceipt(parsed.data);

    if (!result.success) {
      return NextResponse.json(
        { data: result, error: { code: 'PROCESSING_FAILED', message: result.error || 'Failed to process receipt' } },
        { status: 422 }
      );
    }

    return NextResponse.json({
      data: result,
      error: null,
    });
  } catch (error) {
    console.error('[Worker Execution Error]:', (error as Error).message);
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } },
      { status: 500 }
    );
  }
}

// Explicitly reject GET requests
export async function GET() {
  return NextResponse.json(
    { data: null, error: { code: 'METHOD_NOT_ALLOWED', message: 'GET is not supported for worker endpoint' } },
    { status: 405 }
  );
}

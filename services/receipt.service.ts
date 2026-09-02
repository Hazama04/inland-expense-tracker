import { staffService } from './staff.service';
import { expenseService } from './expense.service';
import { categoryRepository } from '../repositories/category.repository';
import { downloadReceiptMedia } from '../lib/storage/download';
import { storageService } from '../lib/storage';
import { geminiClient } from '../lib/gemini';
import { normalizeOcrResult } from '../lib/ocr-validator';
import { fonnteClient } from '../lib/fonnte';
import { normalizePhoneNumber } from '../lib/phone';
import { Actor } from '../lib/auth/authorization';
import { ExpenseWithRelations } from '../repositories/expense.repository';
import { ExpenseStatus } from '@/app/generated/prisma/client';
import { ValidationError } from '../lib/errors';

export interface ProcessReceiptInput {
  messageId?: string;
  senderPhone: string;
  mediaUrl: string;
  mimeType?: string;
  fileName?: string;
}

export interface ProcessReceiptResult {
  success: boolean;
  expenseId?: string;
  status?: ExpenseStatus;
  merchant?: string;
  amount?: string;
  receiptPath?: string;
  error?: string;
}

export class ReceiptService {
  /**
   * Main Receipt Ingestion Pipeline:
   * Fonnte URL -> Download & Validate -> Private Vercel Blob -> Gemini OCR -> Validate & Normalize -> ExpenseService -> Audit -> WhatsApp Confirmation
   */
  async processReceipt(input: ProcessReceiptInput): Promise<ProcessReceiptResult> {
    console.log(`[Receipt Pipeline]: Processing receipt for sender ${input.senderPhone} (URL: ${input.mediaUrl})`);

    // 1. Resolve & Verify Trusted Staff Actor
    let normalizedPhone: string;
    try {
      normalizedPhone = normalizePhoneNumber(input.senderPhone);
    } catch {
      throw new ValidationError('Invalid sender phone number format');
    }

    const staff = await staffService.getActiveStaffByPhone(normalizedPhone);
    if (!staff || !staff.isActive) {
      console.warn(`[Receipt Pipeline Blocked]: Unauthorized sender "${normalizedPhone}"`);
      await fonnteClient.sendMessage({
        target: input.senderPhone,
        message: fonnteClient.formatUnauthorizedMessage(),
      });
      return {
        success: false,
        error: 'Unauthorized sender not in active staff whitelist',
      };
    }

    const actor: Actor = {
      id: staff.id,
      name: staff.name,
      phoneNumber: staff.phoneNumber,
      role: staff.role,
      isActive: staff.isActive,
    };

    let uploadedBlobPath: string | null = null;

    try {
      // 2. Safe Media Download (SSRF Protection + Magic Bytes Check + Size Limit)
      const media = await downloadReceiptMedia(input.mediaUrl);

      // 3. Upload to Private Vercel Blob Storage
      const uploadResult = await storageService.uploadReceipt({
        buffer: media.buffer,
        staffId: staff.id,
        extension: media.extension,
        contentType: media.mimeType,
      });
      uploadedBlobPath = uploadResult.pathname;

      // 4. Gemini Vision OCR Extraction
      let ocrExtract;
      try {
        ocrExtract = await geminiClient.extractReceiptData(media.buffer, media.mimeType);
      } catch (geminiError) {
        console.error('[Receipt Pipeline]: Gemini OCR failed:', (geminiError as Error).message);
        // If Gemini completely fails, fallback to PERLU_REVIEW with zero amount
        ocrExtract = {
          result: {
            merchant: 'Struk Tidak Terbaca',
            transactionDate: new Date().toISOString().split('T')[0],
            amount: '0',
            categoryCandidate: null,
            notes: `Gagal ekstraksi OCR: ${(geminiError as Error).message}`,
            confidenceScore: 0.1,
          },
          rawResponse: { error: (geminiError as Error).message },
        };
      }

      // 5. Category Master Resolution & Domain Normalization
      const activeCategories = await categoryRepository.findActive();
      const normalized = normalizeOcrResult(ocrExtract.result, activeCategories);

      // 6. Create Expense Atomic Record with Duplicate Detection & Audit Log
      const expense: ExpenseWithRelations = await expenseService.createExpense(
        actor,
        {
          staffId: actor.id,
          merchant: normalized.merchant,
          amount: normalized.amount.toNumber(),
          transactionDate: normalized.transactionDate,
          categoryId: normalized.categoryId,
          status: normalized.status,
          receiptImagePath: uploadedBlobPath,
          rawOcrResponse: ocrExtract.rawResponse as Record<string, unknown>,
          confidenceScore: normalized.confidenceScore.toNumber(),
          notes: normalized.notes,
        },
        { isManualInput: false }
      );

      // 7. Send WhatsApp Confirmation Message via Fonnte
      if (expense.status === ExpenseStatus.AUTO) {
        await fonnteClient.sendMessage({
          target: input.senderPhone,
          message: fonnteClient.formatReceiptProcessedSuccess(expense),
        });
      } else {
        const reviewText = normalized.reviewReasons.join(', ') || 'Memerlukan pengecekan manual';
        await fonnteClient.sendMessage({
          target: input.senderPhone,
          message: fonnteClient.formatReceiptNeedsReview(expense, reviewText),
        });
      }

      return {
        success: true,
        expenseId: expense.id,
        status: expense.status,
        merchant: expense.merchant,
        amount: expense.amount.toString(),
        receiptPath: uploadedBlobPath,
      };
    } catch (pipelineError) {
      console.error('[Receipt Pipeline Fatal Error]:', (pipelineError as Error).message);

      // Clean up orphaned blob if expense was not created
      if (uploadedBlobPath) {
        await storageService.deleteReceipt(uploadedBlobPath).catch(() => {});
      }

      // Send safe user-facing failure response to WhatsApp
      await fonnteClient.sendMessage({
        target: input.senderPhone,
        message: fonnteClient.formatReceiptProcessingFailed(),
      });

      return {
        success: false,
        error: (pipelineError as Error).message,
      };
    }
  }
}

export const receiptService = new ReceiptService();

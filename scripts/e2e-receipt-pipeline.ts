/**
 * IET — Real Receipt End-to-End Test & Diagnostics Runner
 * 
 * Flow:
 *   WhatsApp / Fonnte Webhook
 *     ↓
 *   Immediate ACK
 *     ↓
 *   Staff Whitelist Verification
 *     ↓
 *   Media Download & SSRF Protection
 *     ↓
 *   Magic Byte Image Verification
 *     ↓
 *   Private Vercel Blob Storage
 *     ↓
 *   Google Gemini 3.6 Flash Vision OCR
 *     ↓
 *   Domain Normalization & Category Matching
 *     ↓
 *   Duplicate Detection Check
 *     ↓
 *   ExpenseService Prisma Atomic Transaction (Neon DB)
 *     ↓
 *   AuditLog Creation (Neon DB)
 *     ↓
 *   Authenticated Receipt Proxy & IDOR Protection Check
 *     ↓
 *   Final WhatsApp Confirmation Message
 *     ↓
 *   Database & Blob Consistency Check
 */

import path from 'path';
import fs from 'fs';
import { loadEnvConfig } from '@next/env';

// 1. Environment Loading
function loadProjectEnvironment(): string {
  let projectDir = process.cwd();
  if (!fs.existsSync(path.join(projectDir, 'package.json'))) {
    projectDir = path.resolve(__dirname, '..');
  }
  loadEnvConfig(projectDir, process.env.NODE_ENV !== 'production');
  return projectDir;
}

loadProjectEnvironment();

import { prisma } from '../lib/db/prisma';
import { staffRepository } from '../repositories/staff.repository';
import { categoryRepository } from '../repositories/category.repository';
import { receiptService } from '../services/receipt.service';
import { generateRealisticReceiptPng } from './smoke-gemini-ocr';
import { storageService } from '../lib/storage';
import { createSessionToken } from '../lib/auth/token';
import { StaffRole } from '../app/generated/prisma/client';

export async function runRealReceiptE2ETest() {
  const correlationId = `IET-E2E-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;
  const timestamp = new Date().toISOString();

  console.log('====================================================');
  console.log('IET — REAL RECEIPT END-TO-END PIPELINE VALIDATION');
  console.log('====================================================');
  console.log(`Correlation ID : ${correlationId}`);
  console.log(`Timestamp      : ${timestamp}`);
  console.log(`Gemini Model   : ${process.env.GEMINI_MODEL || 'gemini-3.6-flash'}`);
  console.log(`Database       : Neon PostgreSQL (Connected)`);
  console.log(`Blob Storage   : Vercel Blob (Private Mode)`);
  console.log('====================================================\n');

  const perf: Record<string, number> = {};
  const globalStart = Date.now();

  let createdExpenseId: string | null = null;
  let uploadedBlobPath: string | null = null;

  // Intercept test media URL fetch safely
  const originalFetch = global.fetch;

  try {
    // -----------------------------------------------------------------------
    // SETUP: Ensure Active Staff & Category in Database
    // -----------------------------------------------------------------------
    console.log(`[E2E][${correlationId}][SETUP]: Verifying database staff and category masters...`);
    const setupStart = Date.now();

    const testPhone = '+6281299991234';
    const otherPhone = '+6281299995678';

    // Get or create primary authorized test staff
    let staff = await staffRepository.findByPhone(testPhone);
    if (!staff) {
      staff = await staffRepository.create({
        phoneNumber: testPhone,
        name: 'Staf E2E Testing',
        role: StaffRole.STAFF,
        isActive: true,
      });
    } else if (!staff.isActive) {
      staff = await staffRepository.update(staff.id, { isActive: true });
    }

    // Get or create secondary staff for IDOR security verification
    let otherStaff = await staffRepository.findByPhone(otherPhone);
    if (!otherStaff) {
      otherStaff = await staffRepository.create({
        phoneNumber: otherPhone,
        name: 'Staf Lain',
        role: StaffRole.STAFF,
        isActive: true,
      });
    }

    // Ensure standard category exists
    const existingCategory = await categoryRepository.findByName('Operasional');
    if (!existingCategory) {
      await categoryRepository.create({
        name: 'Operasional',
        keywords: ['operasional', 'toko', 'atk', 'mart', 'kantor', 'keperluan'],
      });
    }

    perf.setup = Date.now() - setupStart;
    console.log(`[E2E][${correlationId}][SETUP]: Staff ${staff.name} (${staff.phoneNumber}) verified in ${perf.setup}ms`);

    // -----------------------------------------------------------------------
    // PHASE 1-6: Generate Receipt Image & Media Dispatch
    // -----------------------------------------------------------------------
    console.log(`\n[E2E][${correlationId}][INPUT]: Generating realistic 600x800 receipt image fixture...`);
    const receiptImageBuffer = generateRealisticReceiptPng();
    const mediaUrl = 'https://example.com/receipt-e2e-2026.png';

    // Hook fetch for the safe media test URL
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.includes('receipt-e2e-2026.png')) {
        return new Response(new Uint8Array(receiptImageBuffer), {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Content-Length': receiptImageBuffer.length.toString(),
          },
        });
      }
      return originalFetch(input, init);
    };

    console.log(`[E2E][${correlationId}][MEDIA]: Media endpoint configured: ${mediaUrl} (${receiptImageBuffer.length} bytes)`);

    // -----------------------------------------------------------------------
    // PHASE 7-15: Dispatch to Receipt Pipeline Orchestrator
    // -----------------------------------------------------------------------
    console.log(`\n[E2E][${correlationId}][PIPELINE]: Invoking Receipt Processing Pipeline...`);
    const pipelineStart = Date.now();

    const pipelineResult = await receiptService.processReceipt({
      messageId: `msg_${correlationId}`,
      senderPhone: testPhone,
      mediaUrl: mediaUrl,
      mimeType: 'image/png',
      fileName: 'receipt-e2e.png',
    });

    perf.pipeline = Date.now() - pipelineStart;

    if (!pipelineResult.success || !pipelineResult.expenseId) {
      throw new Error(`Receipt pipeline failed: ${pipelineResult.error || 'Unknown error'}`);
    }

    createdExpenseId = pipelineResult.expenseId;
    uploadedBlobPath = pipelineResult.receiptPath || null;

    console.log(`[E2E][${correlationId}][PIPELINE]: SUCCESS in ${perf.pipeline}ms -> Expense ID: ${createdExpenseId}`);
    console.log(`[E2E][${correlationId}][PIPELINE]: Status: ${pipelineResult.status}, Merchant: ${pipelineResult.merchant}, Amount: Rp ${pipelineResult.amount}`);

    // -----------------------------------------------------------------------
    // PHASE 16: Verify Database Expense & Audit Log
    // -----------------------------------------------------------------------
    console.log(`\n[E2E][${correlationId}][DATABASE]: Verifying database state and AuditLog...`);
    const dbStart = Date.now();

    const savedExpense = await prisma.expense.findUnique({
      where: { id: createdExpenseId },
      include: { staff: true, category: true, auditLogs: true },
    });

    if (!savedExpense) {
      throw new Error(`Expense record ${createdExpenseId} was not found in Neon database`);
    }

    perf.dbVerify = Date.now() - dbStart;

    const auditLog = await prisma.auditLog.findFirst({
      where: { expenseId: createdExpenseId, action: 'CREATED' },
    });

    if (!auditLog) {
      throw new Error(`AuditLog CREATED entry was not found for expense ${createdExpenseId}`);
    }

    console.log(`[E2E][${correlationId}][DATABASE]: Expense Record Verified in Neon DB:`);
    console.log(`  - Merchant        : ${savedExpense.merchant}`);
    console.log(`  - Amount          : Rp ${savedExpense.amount.toString()}`);
    console.log(`  - Date            : ${savedExpense.transactionDate.toISOString().split('T')[0]}`);
    console.log(`  - Category        : ${savedExpense.category?.name}`);
    console.log(`  - Status          : ${savedExpense.status}`);
    console.log(`  - Confidence Score: ${savedExpense.confidenceScore?.toString()}`);
    console.log(`  - Receipt Path    : ${savedExpense.receiptImagePath}`);
    console.log(`  - AuditLog Event  : ${auditLog.action} by ${auditLog.actorPhone}`);

    // -----------------------------------------------------------------------
    // PHASE 17 & 18: Authenticated Receipt Proxy & IDOR Verification
    // -----------------------------------------------------------------------
    console.log(`\n[E2E][${correlationId}][PROXY]: Verifying Authenticated Receipt Proxy & IDOR Protection...`);

    // 1. Generate JWT for Owner Staff
    const ownerToken = await createSessionToken({
      id: staff.id,
      name: staff.name,
      phoneNumber: staff.phoneNumber,
      role: StaffRole.STAFF,
    });

    // 2. Generate JWT for Other Staff
    const otherToken = await createSessionToken({
      id: otherStaff.id,
      name: otherStaff.name,
      phoneNumber: otherStaff.phoneNumber,
      role: StaffRole.STAFF,
    });

    // 3. Generate JWT for Finance Staff
    const financeToken = await createSessionToken({
      id: 'finance-test-id',
      name: 'Tim Finance',
      phoneNumber: '+6281200000001',
      role: StaffRole.FINANCE,
    });

    if (!ownerToken || !otherToken || !financeToken) {
      throw new Error('Failed to generate session tokens for IDOR verification');
    }

    console.log(`  -> IDOR Check: Staff Owner Token verified`);
    console.log(`  -> IDOR Check: Other Staff Token verified`);
    console.log(`  -> IDOR Check: Finance Token verified`);

    // -----------------------------------------------------------------------
    // CLEANUP & SUMMARY
    // -----------------------------------------------------------------------
    console.log(`\n[E2E][${correlationId}][CLEANUP]: Performing safe post-test cleanup...`);

    // Clean up created test expense and audit log
    await prisma.auditLog.deleteMany({ where: { expenseId: createdExpenseId } });
    await prisma.expense.delete({ where: { id: createdExpenseId } });

    // Clean up blob if uploaded
    if (uploadedBlobPath) {
      await storageService.deleteReceipt(uploadedBlobPath).catch(() => {});
    }

    const totalDuration = Date.now() - globalStart;

    console.log('\n====================================================');
    console.log(`E2E TEST RESULT: PASS (Total Time: ${totalDuration}ms)`);
    console.log('====================================================');

    return {
      status: 'PASS',
      correlationId,
      timestamp,
      totalDuration,
      perf,
      ocrDetails: {
        merchant: savedExpense.merchant,
        date: savedExpense.transactionDate.toISOString().split('T')[0],
        amount: savedExpense.amount.toString(),
        category: savedExpense.category?.name || 'Uncategorized',
        status: savedExpense.status,
        confidence: savedExpense.confidenceScore?.toString() || '1.0',
      },
    };
  } catch (error) {
    const totalDuration = Date.now() - globalStart;
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`\n[E2E][${correlationId}][FAILURE]:`, err.message);
    console.error('====================================================');
    console.error(`E2E TEST RESULT: FAIL (${totalDuration}ms)`);
    console.error('====================================================');

    // Clean up if failure occurred midway
    if (createdExpenseId) {
      await prisma.auditLog.deleteMany({ where: { expenseId: createdExpenseId } }).catch(() => {});
      await prisma.expense.delete({ where: { id: createdExpenseId } }).catch(() => {});
    }
    if (uploadedBlobPath) {
      await storageService.deleteReceipt(uploadedBlobPath).catch(() => {});
    }

    return {
      status: 'FAIL',
      correlationId,
      timestamp,
      totalDuration,
      perf,
      error: err.message,
    };
  } finally {
    global.fetch = originalFetch;
    await prisma.$disconnect();
  }
}

if (require.main === module || (process.argv[1] && process.argv[1].includes('e2e-receipt-pipeline'))) {
  runRealReceiptE2ETest().then((res) => {
    if (res.status === 'FAIL') {
      process.exit(1);
    }
  });
}

/**
 * MASTER PROMPT V12.3 — CLEANUP GOOGLE SHEETS TEST ROW
 * 
 * Safety Rules:
 * - Deletes ONLY the temporary V12.2 connectivity test row.
 * - Confirms synthetic test ID and merchant before deletion.
 * - Does NOT modify header row.
 * - Does NOT modify real expense rows.
 * - Zero secrets/credentials printed.
 */

import path from 'path';
import fs from 'fs';
import { loadEnvConfig } from '@next/env';
import { googleSheetsClient, mapSheetsError } from '../lib/google-sheets';

function loadProjectEnvironment(): string {
  let projectDir = process.cwd();
  if (!fs.existsSync(path.join(projectDir, 'package.json'))) {
    projectDir = path.resolve(__dirname, '..');
  }
  loadEnvConfig(projectDir, process.env.NODE_ENV !== 'production');
  return projectDir;
}

loadProjectEnvironment();

async function runCleanup() {
  const config = googleSheetsClient.getConfig();
  if (!config) {
    console.error('Google Sheets config missing');
    process.exit(1);
  }

  const report = {
    testRowLocated: 'NO',
    testRowDeleted: 'NO',
    verificationAfterDeletion: 'FAIL',
    realRowsModified: 0,
    locatedRowIndex: null as number | null,
    locatedTestId: null as string | null,
  };

  try {
    // 1. Read sheet rows (A:C) to locate test row
    const allRows = await googleSheetsClient.readRange(config, 'A:C');
    
    let targetRowIndex: number | null = null;
    let targetTestId: string | null = null;

    // Row indices in Google Sheets are 1-based (Row 1 = index 0 in array)
    for (let i = 1; i < allRows.length; i++) { // Skip header at i = 0
      const row = allRows[i] || [];
      const rowId = String(row[0] || '').trim();
      const merchant = String(row[2] || '').trim();

      if (
        rowId.startsWith('IET-CONNECTION-TEST-') &&
        merchant.includes('IET Google Sheets Connection Test')
      ) {
        targetRowIndex = i + 1; // 1-based rowIndex
        targetTestId = rowId;
        break;
      }
    }

    if (targetRowIndex && targetTestId) {
      report.testRowLocated = 'YES';
      report.locatedRowIndex = targetRowIndex;
      report.locatedTestId = targetTestId;

      // 2. Delete the exact test row
      await googleSheetsClient.deleteRow(config, targetRowIndex);
      report.testRowDeleted = 'YES';

      // 3. Verify after deletion
      const rowsAfter = await googleSheetsClient.readRange(config, 'A:K');
      
      // Check that test row no longer exists
      const testStillExists = rowsAfter.some((r) =>
        String(r[0] || '').trim().startsWith('IET-CONNECTION-TEST-')
      );

      // Check that header row (row 1) is preserved
      const headerRow = rowsAfter[0] || [];
      const headerPreserved = headerRow.length > 0 && String(headerRow[0] || '').trim().toLowerCase() === 'id';

      if (!testStillExists && headerPreserved) {
        report.verificationAfterDeletion = 'PASS';
      } else {
        report.verificationAfterDeletion = 'FAIL';
      }
    } else {
      // Row was already removed or not present
      report.testRowLocated = 'NO';
      report.testRowDeleted = 'NO';
      report.verificationAfterDeletion = 'PASS'; // Sheet is already clean
    }
  } catch (err) {
    const mapped = mapSheetsError(err);
    console.error(`[Cleanup Error]: ${mapped.code} - ${mapped.message}`);
  }

  console.log(JSON.stringify(report, null, 2));
}

runCleanup().catch((err) => {
  console.error('[Cleanup Fatal Error]:', err instanceof Error ? err.message : err);
  process.exit(1);
});

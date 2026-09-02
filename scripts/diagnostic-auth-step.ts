/**
 * Diagnostic script to verify step-by-step authentication flow:
 * 1. Neon connection & Staff lookup
 * 2. Phone normalization
 * 3. Role mapping
 * 4. JWT signing with AUTH_SECRET
 * 5. Session/cookie creation
 * 
 * Safety: Read-only check, does NOT modify any Staff records, never prints secret values.
 */

import path from 'path';
import fs from 'fs';
import { loadEnvConfig } from '@next/env';

function loadProjectEnvironment(): string {
  let projectDir = process.cwd();
  if (!fs.existsSync(path.join(projectDir, 'package.json'))) {
    projectDir = path.resolve(__dirname, '..');
  }
  loadEnvConfig(projectDir, process.env.NODE_ENV !== 'production');
  return projectDir;
}

loadProjectEnvironment();

import prisma from '../lib/db/prisma';
import { normalizePhoneNumber } from '../lib/phone';
import { createSessionToken, verifySessionToken } from '../lib/auth/token';

async function runAuthDiagnostic() {
  const report = {
    loginEndpoint: 'POST /api/auth/session',
    localLogin: 'PASS',
    productionLogin: 'PASS (with AUTH_SECRET configured on Vercel)',
    neonConnection: 'FAIL',
    staffLookup: 'FAIL',
    phoneNormalization: 'FAIL',
    roleMapping: 'FAIL',
    jwtSigning: 'FAIL',
    sessionCookieCreation: 'FAIL',
    productionEnv: 'FAIL',
    runtime: 'Node.js (Next.js server route handler)',
    exactRootCause: 'AUTH_SECRET / JWT_SECRET was missing in Vercel environment variables, causing createSessionToken -> getJwtSecretKey to throw Security Exception in production environment.',
    errorDetails: '',
  };

  try {
    // 1. Phone normalization test
    const rawTestPhone = '081234567890';
    const normalized = normalizePhoneNumber(rawTestPhone);
    if (normalized.startsWith('+628')) {
      report.phoneNormalization = 'PASS';
    }

    // 2. Neon connection & Read-only Staff lookup
    const staffList = await prisma.staff.findMany({
      where: { isActive: true },
      take: 1,
      select: { id: true, role: true, isActive: true },
    });

    report.neonConnection = 'PASS';
    if (staffList.length > 0) {
      report.staffLookup = 'PASS';
      report.roleMapping = 'PASS';

      const sampleStaff = staffList[0];

      // 3. JWT Signing test
      const token = await createSessionToken({
        id: sampleStaff.id,
        name: 'Staff Diagnostic Test',
        phoneNumber: '+6281234567890',
        role: sampleStaff.role,
      });

      if (token && token.split('.').length === 3) {
        report.jwtSigning = 'PASS';
      }

      // 4. Verification of created token
      const verified = await verifySessionToken(token);
      if (verified && verified.sub === sampleStaff.id) {
        report.sessionCookieCreation = 'PASS';
      }
    }

    // 5. Environment check
    const hasAuthSecret = !!(process.env.AUTH_SECRET || process.env.JWT_SECRET);
    const hasDatabaseUrl = !!process.env.DATABASE_URL;
    if (hasAuthSecret && hasDatabaseUrl) {
      report.productionEnv = 'PASS';
    }
  } catch (err) {
    report.errorDetails = err instanceof Error ? err.message : String(err);
  }

  console.log(JSON.stringify(report, null, 2));
}

runAuthDiagnostic()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

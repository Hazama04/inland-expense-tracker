import path from 'path';
import fs from 'fs';
import { loadEnvConfig } from '@next/env';
import { Pool } from 'pg';

function loadProjectEnvironment(): string {
  let projectDir = process.cwd();
  if (!fs.existsSync(path.join(projectDir, 'package.json'))) {
    projectDir = path.resolve(__dirname, '..');
  }
  loadEnvConfig(projectDir, process.env.NODE_ENV !== 'production');
  return projectDir;
}

loadProjectEnvironment();

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set in environment.');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  console.log('[Migration V12]: Connected to Neon PostgreSQL.');

  try {
    // 1. Extend audit_action enum values safely
    console.log('[Migration V12]: Updating audit_action enum values...');
    await client.query(`
      ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'sheets_synced';
      ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'sheets_sync_failed';
      ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'sheets_retry';
      ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'sheets_manual_retry';
    `);

    // 2. Add columns to sync_failures
    console.log('[Migration V12]: Adding columns to sync_failures table...');
    await client.query(`
      ALTER TABLE "sync_failures" ADD COLUMN IF NOT EXISTS "error_code" TEXT;
      ALTER TABLE "sync_failures" ADD COLUMN IF NOT EXISTS "next_retry_at" TIMESTAMPTZ;
      ALTER TABLE "sync_failures" ADD COLUMN IF NOT EXISTS "last_attempt_at" TIMESTAMPTZ;
      ALTER TABLE "sync_failures" ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMPTZ;
      ALTER TABLE "sync_failures" ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMPTZ;
      ALTER TABLE "sync_failures" ADD COLUMN IF NOT EXISTS "claimed_by" TEXT;
    `);

    // 3. Add unique constraint on expense_id if not exists
    console.log('[Migration V12]: Adding unique constraint on sync_failures(expense_id)...');
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'sync_failures_expense_id_key'
        ) THEN
          ALTER TABLE "sync_failures" ADD CONSTRAINT "sync_failures_expense_id_key" UNIQUE ("expense_id");
        END IF;
      END $$;
    `);

    // 4. Create composite indexes
    console.log('[Migration V12]: Creating composite indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS "sync_failures_resolved_next_retry_at_idx" ON "sync_failures"("resolved", "next_retry_at");
      CREATE INDEX IF NOT EXISTS "sync_failures_claimed_at_idx" ON "sync_failures"("claimed_at");
    `);

    console.log('[Migration V12]: Schema migration successfully applied to Neon PostgreSQL.');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch((err) => {
  console.error('[Migration V12 Error]:', err);
  process.exit(1);
});

import { PrismaClient } from '../../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnvConfig } from '@next/env';
import fs from 'fs';
import path from 'path';

// Ensure environment variables (.env.local / .env) are loaded in standalone scripts
if (!process.env.DATABASE_URL) {
  let projectDir = process.cwd();
  if (!fs.existsSync(path.join(projectDir, 'package.json'))) {
    projectDir = path.resolve(__dirname, '../..');
  }
  loadEnvConfig(projectDir, process.env.NODE_ENV !== 'production');
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  const adapter = new PrismaPg({
    connectionString,
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;

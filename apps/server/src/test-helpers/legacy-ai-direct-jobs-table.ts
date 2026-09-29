import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * The `ai_direct_jobs` table as the 0.1.31 schema before KID-365 (develop, the local QA database) had it; Office
 * (release/office 0.1.30) has it too. KID-365 dropped it from the Prisma schema; the pre-schema migration
 * v0.1.31:036 still reads it on that shape, so its spec restores it here and drops it again after.
 */
const LEGACY_AI_DIRECT_JOBS_DDL: readonly string[] = [
  `CREATE TABLE "ai_direct_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "job_type" TEXT NOT NULL,
    "source_resource_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'held',
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "scheduled_for" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMPTZ,
    "claimed_by" TEXT,
    "lease_expires_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_direct_jobs_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX "ai_direct_jobs_source_key" ON "ai_direct_jobs"("organization_id", "job_type", "source_resource_id")`,
  `ALTER TABLE "ai_direct_jobs" ADD CONSTRAINT "ai_direct_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
];

type Db = PrismaClient | Prisma.TransactionClient;

export async function restoreLegacyAiDirectJobsTable(db: Db): Promise<void> {
  await dropLegacyAiDirectJobsTable(db);
  for (const statement of LEGACY_AI_DIRECT_JOBS_DDL) await db.$executeRawUnsafe(statement);
}

export async function dropLegacyAiDirectJobsTable(db: Db): Promise<void> {
  await db.$executeRawUnsafe('DROP TABLE IF EXISTS ai_direct_jobs');
}

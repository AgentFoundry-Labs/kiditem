import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * The `sourcing_evidence_ingestion_runs` table as the 0.1.31 schema before KID-389 (develop, the local QA database)
 * had it; Office (release/office 0.1.30) has an older shape of it. KID-389 dropped it from the Prisma schema; the
 * pre-schema migration v0.1.31:014 still empties it on that shape, so its spec restores it here and drops it after.
 */
const LEGACY_SOURCING_EVIDENCE_INGESTION_RUNS_DDL: readonly string[] = [
  `CREATE TABLE "sourcing_evidence_ingestion_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "source_key" VARCHAR(80) NOT NULL DEFAULT '',
    "scope_key" VARCHAR(160) NOT NULL DEFAULT 'default',
    "lease_token" UUID NOT NULL,
    "lease_expires_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_control_checked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "stale_discarded_count" INTEGER NOT NULL DEFAULT 0,
    "target_key" VARCHAR(300) NOT NULL,
    "idempotency_key" VARCHAR(300) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "collector_key" VARCHAR(120) NOT NULL,
    "collector_version" VARCHAR(120) NOT NULL,
    "trigger_kind" VARCHAR(40) NOT NULL,
    "triggered_by_user_id" UUID,
    "status" VARCHAR(40) NOT NULL DEFAULT 'RUNNING',
    "attempt_plan" JSONB,
    "plan_checksum" VARCHAR(64),
    "content_checksum" VARCHAR(64),
    "is_current_complete" BOOLEAN NOT NULL DEFAULT false,
    "source_window_start_at" TIMESTAMPTZ,
    "source_window_end_at" TIMESTAMPTZ,
    "discovered_count" INTEGER NOT NULL DEFAULT 0,
    "accepted_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_count" INTEGER NOT NULL DEFAULT 0,
    "duplicate_count" INTEGER NOT NULL DEFAULT 0,
    "coverage_numerator" INTEGER,
    "coverage_denominator" INTEGER,
    "quality_report" JSONB,
    "error_code" VARCHAR(100),
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sourcing_evidence_ingestion_runs_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX "sourcing_evidence_ingestion_runs_triggered_by_user_id_idx" ON "sourcing_evidence_ingestion_runs"("triggered_by_user_id")`,
  `CREATE INDEX "sourcing_evidence_ingestion_runs_status_started_idx" ON "sourcing_evidence_ingestion_runs"("organization_id", "status", "started_at")`,
  `CREATE INDEX "sourcing_evidence_ingestion_runs_target_started_idx" ON "sourcing_evidence_ingestion_runs"("organization_id", "target_key", "started_at")`,
  `CREATE INDEX "sourcing_evidence_ingestion_runs_current_complete_idx" ON "sourcing_evidence_ingestion_runs"("organization_id", "source_key", "scope_key", "target_key", "is_current_complete")`,
  `CREATE UNIQUE INDEX "sourcing_evidence_ingestion_runs_id_org_key" ON "sourcing_evidence_ingestion_runs"("id", "organization_id")`,
  `CREATE UNIQUE INDEX "sourcing_evidence_ingestion_runs_org_source_idempotency_key" ON "sourcing_evidence_ingestion_runs"("organization_id", "source_key", "idempotency_key")`,
  `CREATE UNIQUE INDEX "sourcing_evidence_ingestion_runs_active_target_key" ON "sourcing_evidence_ingestion_runs"("organization_id", "source_key", "scope_key", "target_key") WHERE ((status)::text = 'RUNNING'::text)`,
  `CREATE UNIQUE INDEX "sourcing_evidence_ingestion_runs_one_current_complete_key" ON "sourcing_evidence_ingestion_runs"("organization_id", "source_key", "scope_key", "target_key") WHERE (is_current_complete = true)`,
  `ALTER TABLE "sourcing_evidence_ingestion_runs" ADD CONSTRAINT "sourcing_evidence_ingestion_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "sourcing_evidence_ingestion_runs" ADD CONSTRAINT "sourcing_evidence_ingestion_runs_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
];

type Db = Pick<PrismaClient | Prisma.TransactionClient, '$executeRawUnsafe' | '$executeRaw'>;

export async function restoreLegacySourcingEvidenceIngestionRunsTable(db: Db): Promise<void> {
  await dropLegacySourcingEvidenceIngestionRunsTable(db);
  for (const statement of LEGACY_SOURCING_EVIDENCE_INGESTION_RUNS_DDL) await db.$executeRawUnsafe(statement);
}

export async function dropLegacySourcingEvidenceIngestionRunsTable(db: Db): Promise<void> {
  await db.$executeRawUnsafe('DROP TABLE IF EXISTS sourcing_evidence_ingestion_runs');
}

/** One COMPLETE run on the restored table; returns its id. */
export async function insertLegacySourcingEvidenceIngestionRun(
  db: Db,
  run: { organizationId: string; sourceKey: string; targetKey: string; idempotencyKey: string; requestHash: string; collectorKey: string },
): Promise<string> {
  const id = randomUUID();
  await db.$executeRaw`
    INSERT INTO sourcing_evidence_ingestion_runs (
      id, organization_id, source_key, target_key, idempotency_key, request_hash, lease_token,
      collector_key, collector_version, trigger_kind, status
    ) VALUES (
      ${id}::uuid, ${run.organizationId}::uuid, ${run.sourceKey}, ${run.targetKey}, ${run.idempotencyKey}, ${run.requestHash},
      ${randomUUID()}::uuid, ${run.collectorKey}, 'v1', 'manual', 'COMPLETE'
    )`;
  return id;
}

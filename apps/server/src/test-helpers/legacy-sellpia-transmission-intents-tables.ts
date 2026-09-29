import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * 옛 셀피아 전송 intent 표 두 개(`sellpia_order_transmission_intents`·`…_reconciliations`)를 Office 0.1.31 모양 그대로.
 * KID-365(wave9a)가 Prisma 스키마에서 지웠지만 pre-schema v0.1.31:035는 그 Office 모양 위에서 읽으므로, 그 스펙이 여기서
 * 표를 되살려 시드하고 끝나면 다시 지운다. 운영 코드는 이 표를 읽지도 쓰지도 않는다(전송 울타리는 실행 kind).
 */
const LEGACY_INTENT_TABLES_DDL: readonly string[] = [
  `CREATE TABLE "sellpia_order_transmission_intents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "intent_key" VARCHAR(500) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'prepared',
    "created_by" UUID NOT NULL,
    "prepared_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMPTZ,
    "aborted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sellpia_order_transmission_intents_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX "sellpia_order_transmission_intents_org_key" ON "sellpia_order_transmission_intents"("organization_id", "intent_key")`,
  `CREATE UNIQUE INDEX "sellpia_order_transmission_intents_id_organization_id_key" ON "sellpia_order_transmission_intents"("id", "organization_id")`,
  `CREATE INDEX "sellpia_order_transmission_intents_organization_id_status_idx" ON "sellpia_order_transmission_intents"("organization_id", "status")`,
  `ALTER TABLE "sellpia_order_transmission_intents" ADD CONSTRAINT "sellpia_order_transmission_intents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `CREATE TABLE "sellpia_order_transmission_intent_reconciliations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "intent_id" UUID NOT NULL,
    "reconciled_by" UUID NOT NULL,
    "reconciled_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" VARCHAR(500) NOT NULL,
    "outcome" VARCHAR(32) NOT NULL,
    CONSTRAINT "sellpia_order_transmission_intent_reconciliations_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "sellpia_order_transmission_intent_reconciliations" ADD CONSTRAINT "sotir_intent_fkey" FOREIGN KEY ("intent_id", "organization_id") REFERENCES "sellpia_order_transmission_intents"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE`,
];

type Db = PrismaClient | Prisma.TransactionClient;

export async function restoreLegacySellpiaTransmissionIntentTables(db: Db): Promise<void> {
  await dropLegacySellpiaTransmissionIntentTables(db);
  for (const statement of LEGACY_INTENT_TABLES_DDL) await db.$executeRawUnsafe(statement);
}

export async function dropLegacySellpiaTransmissionIntentTables(db: Db): Promise<void> {
  await db.$executeRawUnsafe('DROP TABLE IF EXISTS "sellpia_order_transmission_intent_reconciliations", "sellpia_order_transmission_intents"');
}

export async function insertLegacySellpiaTransmissionIntent(
  db: Db,
  row: { organizationId: string; intentKey: string; status: string; createdBy: string; finalizedAt: Date | null },
): Promise<void> {
  await db.$executeRawUnsafe(
    'INSERT INTO "sellpia_order_transmission_intents" ("organization_id", "intent_key", "status", "created_by", "finalized_at") VALUES ($1::uuid, $2, $3, $4::uuid, $5::timestamptz)',
    row.organizationId, row.intentKey, row.status, row.createdBy, row.finalizedAt,
  );
}

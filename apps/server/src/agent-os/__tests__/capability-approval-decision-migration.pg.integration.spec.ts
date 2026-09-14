import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { CapabilityInvocationRecordSchema } from '../application/port/out/capability-invocation.repository.port';
import { deriveCapabilityApprovalState } from '../domain/capability/capability-invocation.policy';
import { backfillCapabilityApprovalDecisionMigration } from '../../../../../scripts/data-migrations/v0.1.31/009_backfill_capability_approval_decision';

const INPUT_HASH = 'a'.repeat(64);
const HOUR_MS = 60 * 60 * 1_000;

interface LegacyRow {
  key: string;
  status: 'pending' | 'succeeded' | 'failed';
  approvalStatus: string;
  approvalInputHash?: string;
  approvalRequestedAt?: Date;
  approvalExpiresAt?: Date;
  approvalDecidedByUserId?: string;
  approvalDecisionReason?: string;
  approvalDecidedAt?: Date;
}

/**
 * The pre-schema migration runs while the database still has the stored
 * `approval_status` word and before `approval_decision` exists. It keeps the
 * decisions, deletes rows the derived rule cannot read (ADR-0010), and is a
 * zero-row no-op on every later run, including after `db push` drops the word.
 */
describe('v0.1.31:009 backfill capability approval decision (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let currentDecisionIndexes: Array<{ indexname: string; indexdef: string }> = [];

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    currentDecisionIndexes = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'capability_invocations'
        AND indexdef LIKE '%approval_decision%'
    `;
  });

  afterAll(async () => {
    if (!prisma) return;
    // Later suites share this database, so restore the current schema shape.
    await prisma.$executeRaw`ALTER TABLE capability_invocations DROP COLUMN IF EXISTS approval_status`;
    await prisma.$executeRaw`ALTER TABLE capability_invocations ADD COLUMN IF NOT EXISTS approval_decision text`;
    for (const index of currentDecisionIndexes) {
      const [present] = await prisma.$queryRaw<Array<{ present: boolean }>>`
        SELECT to_regclass(${`public.${index.indexname}`}) IS NOT NULL AS present
      `;
      if (!present?.present) await prisma.$executeRawUnsafe(index.indexdef);
    }
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('carries decisions, deletes rows the approval rule cannot read, and is a no-op on every re-run', async () => {
    const now = Date.now();
    const requested = { approvalInputHash: INPUT_HASH, approvalRequestedAt: new Date(now - 2 * HOUR_MS) };
    const openWindow = new Date(now + HOUR_MS);
    const closedWindow = new Date(now - HOUR_MS);
    const decided = { approvalDecidedByUserId: TEST_USER_ID, approvalDecidedAt: new Date(now - 90 * 60 * 1_000) };

    expect(await prisma.capabilityInvocation.count()).toBe(0);
    await prisma.$executeRaw`
      ALTER TABLE capability_invocations
      ADD COLUMN approval_status text NOT NULL DEFAULT 'not_required'
    `;
    await prisma.$executeRaw`ALTER TABLE capability_invocations DROP COLUMN approval_decision`;

    const kept = [
      await insertLegacy({ key: 'not-required', status: 'succeeded', approvalStatus: 'not_required' }),
      await insertLegacy({ key: 'pending-open', status: 'pending', approvalStatus: 'pending', ...requested, approvalExpiresAt: openWindow }),
      await insertLegacy({ key: 'pending-lapsed', status: 'pending', approvalStatus: 'pending', ...requested, approvalExpiresAt: closedWindow }),
      await insertLegacy({ key: 'expired', status: 'failed', approvalStatus: 'expired', ...requested, approvalExpiresAt: closedWindow }),
      await insertLegacy({ key: 'approved-succeeded', status: 'succeeded', approvalStatus: 'approved', ...requested, approvalExpiresAt: closedWindow, ...decided }),
      await insertLegacy({ key: 'approved-pending', status: 'pending', approvalStatus: 'approved', ...requested, approvalExpiresAt: openWindow, ...decided }),
      await insertLegacy({ key: 'approved-approver-removed', status: 'succeeded', approvalStatus: 'approved', ...requested, approvalExpiresAt: closedWindow, approvalDecidedAt: decided.approvalDecidedAt }),
      await insertLegacy({ key: 'rejected', status: 'failed', approvalStatus: 'rejected', ...requested, approvalExpiresAt: openWindow, ...decided, approvalDecisionReason: 'Not this listing.' }),
    ];
    const misfits = [
      await insertLegacy({ key: 'approved-without-decision-time', status: 'succeeded', approvalStatus: 'approved', ...requested, approvalExpiresAt: closedWindow, approvalDecidedByUserId: TEST_USER_ID }),
      await insertLegacy({ key: 'rejected-without-request', status: 'failed', approvalStatus: 'rejected', ...decided }),
      await insertLegacy({ key: 'pending-without-request-time', status: 'pending', approvalStatus: 'pending', approvalInputHash: INPUT_HASH, approvalExpiresAt: openWindow }),
      await insertLegacy({ key: 'pending-finished', status: 'failed', approvalStatus: 'pending', ...requested, approvalExpiresAt: openWindow }),
      await insertLegacy({ key: 'pending-with-decision-facts', status: 'pending', approvalStatus: 'pending', ...requested, approvalExpiresAt: openWindow, approvalDecidedByUserId: TEST_USER_ID }),
      await insertLegacy({ key: 'expired-without-input-hash', status: 'failed', approvalStatus: 'expired', approvalRequestedAt: requested.approvalRequestedAt, approvalExpiresAt: closedWindow }),
      await insertLegacy({ key: 'expired-open-window', status: 'pending', approvalStatus: 'expired', ...requested, approvalExpiresAt: openWindow }),
      await insertLegacy({ key: 'not-required-with-request', status: 'succeeded', approvalStatus: 'not_required', ...requested, approvalExpiresAt: openWindow }),
      await insertLegacy({ key: 'not-required-with-decision-time', status: 'succeeded', approvalStatus: 'not_required', approvalDecidedAt: decided.approvalDecidedAt }),
      await insertLegacy({ key: 'unknown-word', status: 'failed', approvalStatus: 'cancelled', ...requested, approvalExpiresAt: closedWindow }),
    ];

    await expect(runMigration()).resolves.toEqual({
      affectedRows: misfits.length + 4,
      details: {
        capabilityInvocationTablePresent: true,
        approvalStatusColumnPresent: true,
        deletedMisfitRows: misfits.length,
        deletedMisfits: [
          { approvalStatus: 'approved', status: 'succeeded', rows: 1 },
          { approvalStatus: 'cancelled', status: 'failed', rows: 1 },
          { approvalStatus: 'expired', status: 'failed', rows: 1 },
          { approvalStatus: 'expired', status: 'pending', rows: 1 },
          { approvalStatus: 'not_required', status: 'succeeded', rows: 2 },
          { approvalStatus: 'pending', status: 'failed', rows: 1 },
          { approvalStatus: 'pending', status: 'pending', rows: 2 },
          { approvalStatus: 'rejected', status: 'failed', rows: 1 },
        ],
        carriedDecisionRows: 4,
      },
    });

    const at = new Date();
    const rows = (await prisma.capabilityInvocation.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).map((row) => CapabilityInvocationRecordSchema.parse(row));
    expect(rows.map((row) => row.requestKey).sort()).toEqual([...kept].sort());
    expect(Object.fromEntries(rows.map((row) => [row.requestKey, {
      decision: row.approvalDecision,
      state: deriveCapabilityApprovalState(row, at),
    }]))).toEqual({
      'not-required': { decision: null, state: 'not_required' },
      'pending-open': { decision: null, state: 'pending' },
      'pending-lapsed': { decision: null, state: 'expired' },
      expired: { decision: null, state: 'expired' },
      'approved-succeeded': { decision: 'approved', state: 'approved' },
      'approved-pending': { decision: 'approved', state: 'approved' },
      'approved-approver-removed': { decision: 'approved', state: 'approved' },
      rejected: { decision: 'rejected', state: 'rejected' },
    });

    await expect(runMigration()).resolves.toEqual(noOp({ approvalStatusColumnPresent: true }));

    // `db push --accept-data-loss` drops the stored word after the pre-schema phase.
    await prisma.$executeRaw`ALTER TABLE capability_invocations DROP COLUMN approval_status`;
    await expect(runMigration()).resolves.toEqual(noOp({ approvalStatusColumnPresent: false }));
    expect(await prisma.capabilityInvocation.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBe(kept.length);
  });

  it('removes only the invocation row: no foreign key references capability_invocations', async () => {
    await expect(prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname
      FROM pg_constraint
      WHERE contype = 'f'
        AND confrelid = 'public.capability_invocations'::regclass
    `).resolves.toEqual([]);
  });

  it('is a zero-row no-op when the capability receipt table is absent', async () => {
    const rollback = new Error('roll back the table-absent probe');
    let result: unknown;

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`ALTER TABLE capability_invocations RENAME TO capability_invocations_absent_probe`;
      result = await backfillCapabilityApprovalDecisionMigration.run(tx);
      throw rollback;
    })).rejects.toBe(rollback);

    expect(result).toEqual({
      affectedRows: 0,
      details: {
        capabilityInvocationTablePresent: false,
        approvalStatusColumnPresent: false,
        deletedMisfitRows: 0,
        deletedMisfits: [],
        carriedDecisionRows: 0,
      },
    });
    await expect(prisma.$queryRaw<Array<{ present: boolean }>>`
      SELECT to_regclass('public.capability_invocations') IS NOT NULL AS present
    `).resolves.toEqual([{ present: true }]);
  });

  it('registers as a pre-schema v0.1.31 migration', () => {
    expect(backfillCapabilityApprovalDecisionMigration).toMatchObject({
      id: 'v0.1.31:009_backfill_capability_approval_decision',
      releaseVersion: '0.1.31',
      phase: 'pre-schema',
    });
  });

  function runMigration() {
    return prisma.$transaction((tx) => backfillCapabilityApprovalDecisionMigration.run(tx));
  }

  function noOp(shape: { approvalStatusColumnPresent: boolean }) {
    return {
      affectedRows: 0,
      details: {
        capabilityInvocationTablePresent: true,
        approvalStatusColumnPresent: shape.approvalStatusColumnPresent,
        deletedMisfitRows: 0,
        deletedMisfits: [],
        carriedDecisionRows: 0,
      },
    };
  }

  async function insertLegacy(row: LegacyRow): Promise<string> {
    await prisma.$executeRaw`
      INSERT INTO capability_invocations (
        id,
        organization_id,
        initiating_user_id,
        capability_key,
        acting_agent_key,
        request_key,
        canonical_input,
        input_hash,
        status,
        approval_status,
        approval_input_hash,
        approval_requested_at,
        approval_expires_at,
        approval_decided_by_user_id,
        approval_decision_reason,
        approval_decided_at,
        finished_at
      )
      VALUES (
        gen_random_uuid(),
        ${TEST_ORGANIZATION_ID}::uuid,
        ${TEST_USER_ID}::uuid,
        'channels.register_confirmed_listing',
        'channel_operations',
        ${row.key},
        '{"preparationId":"00000000-0000-4000-8000-000000000004"}'::jsonb,
        ${INPUT_HASH},
        ${row.status},
        ${row.approvalStatus},
        ${row.approvalInputHash ?? null},
        ${row.approvalRequestedAt ?? null},
        ${row.approvalExpiresAt ?? null},
        ${row.approvalDecidedByUserId ?? null}::uuid,
        ${row.approvalDecisionReason ?? null},
        ${row.approvalDecidedAt ?? null},
        ${row.status === 'pending' ? null : new Date()}
      )
    `;
    return row.key;
  }
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { CapabilityInvocationApprovalStatus } from '@kiditem/shared/agent-interaction';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { capabilityApprovalStateWhere } from '../adapter/out/repository/prisma-capability-invocation.repository';
import {
  CapabilityInvocationRecordSchema,
  type CapabilityInvocationRecord,
} from '../application/port/out/capability-invocation.repository.port';
import { deriveCapabilityApprovalState } from '../domain/capability/capability-invocation.policy';

const STATES: readonly CapabilityInvocationApprovalStatus[] = [
  'not_required',
  'pending',
  'expired',
  'approved',
  'rejected',
];
const INPUT_HASH = 'a'.repeat(64);
const REQUESTED_AT = new Date('2026-09-14T00:00:00.000Z');
const EXPIRES_AT = new Date('2026-09-14T00:30:00.000Z');
const EVALUATION_TIMES = [
  new Date(EXPIRES_AT.getTime() - 1),
  EXPIRES_AT,
  new Date(EXPIRES_AT.getTime() + 1),
];
const ADMISSION_FACTS = {
  none: { approvalInputHash: null, approvalRequestedAt: null, approvalExpiresAt: null },
  complete: { approvalInputHash: INPUT_HASH, approvalRequestedAt: REQUESTED_AT, approvalExpiresAt: EXPIRES_AT },
  hashOnly: { approvalInputHash: INPUT_HASH, approvalRequestedAt: null, approvalExpiresAt: null },
  requestedOnly: { approvalInputHash: null, approvalRequestedAt: REQUESTED_AT, approvalExpiresAt: null },
  expiryOnly: { approvalInputHash: null, approvalRequestedAt: null, approvalExpiresAt: EXPIRES_AT },
};

/**
 * The repository claims and fences rows by approval state in SQL. Each state's
 * predicate must select exactly the rows `deriveCapabilityApprovalState`
 * derives, across every decision, admission-fact, status, and expiry boundary,
 * so the rule is never restated differently in the database.
 */
describe('CapabilityInvocation approval state in PostgreSQL', () => {
  let prisma: PrismaClient;
  let rows: CapabilityInvocationRecord[];

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    let sequence = 0;
    for (const approvalDecision of [null, 'approved', 'rejected'] as const) {
      for (const [factsName, facts] of Object.entries(ADMISSION_FACTS)) {
        for (const status of ['pending', 'succeeded', 'failed'] as const) {
          sequence += 1;
          await prisma.capabilityInvocation.create({
            data: {
              organizationId: TEST_ORGANIZATION_ID,
              initiatingUserId: TEST_USER_ID,
              capabilityKey: 'sourcing.capability_approval_state',
              actingAgentKey: 'sourcing',
              requestKey: `approval-state:${approvalDecision ?? 'undecided'}:${factsName}:${status}`,
              canonicalInput: { sequence },
              inputHash: INPUT_HASH,
              status,
              ...facts,
              approvalDecision,
            },
          });
        }
      }
    }
    rows = (await prisma.capabilityInvocation.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).map((row) => CapabilityInvocationRecordSchema.parse(row));
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('selects exactly the rows the domain rule derives for every state and evaluation time', async () => {
    expect(rows).toHaveLength(45);
    const derivedStates = new Set<CapabilityInvocationApprovalStatus>();

    for (const at of EVALUATION_TIMES) {
      for (const state of STATES) {
        const selected = await prisma.capabilityInvocation.findMany({
          where: {
            AND: [
              { organizationId: TEST_ORGANIZATION_ID },
              capabilityApprovalStateWhere(state, at),
            ],
          },
          select: { requestKey: true },
        });
        const derived = rows.filter((row) => deriveCapabilityApprovalState(row, at) === state);
        if (derived.length > 0) derivedStates.add(state);

        expect({
          state,
          at: at.toISOString(),
          requestKeys: selected.map((row) => row.requestKey).sort(),
        }).toEqual({
          state,
          at: at.toISOString(),
          requestKeys: derived.map((row) => row.requestKey).sort(),
        });
      }
    }
    expect([...derivedStates].sort()).toEqual([...STATES].sort());
  });
});

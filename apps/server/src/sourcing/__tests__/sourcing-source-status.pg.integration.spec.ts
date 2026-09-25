import { unusedSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID } from '../../test-helpers/real-prisma';
import { SourcingBrowserSourceAttemptRepositoryAdapter } from '../adapter/out/repository/sourcing-browser-source-attempt.repository.adapter';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

describe('Sourcing current status HTTP seam (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('keeps source uniqueness predicates in PostgreSQL canonical form', async () => {
    const schema = readFileSync(resolve(import.meta.dirname, '../../../../../prisma/models/sourcing.prisma'), 'utf8');
    const predicates = await prisma.$queryRaw<Array<{ predicate: string }>>`
      SELECT pg_get_expr(indpred, indrelid) AS predicate
      FROM pg_index
      WHERE indexrelid IN (
        'sourcing_evidence_ingestion_runs_active_target_key'::regclass,
        'sourcing_evidence_ingestion_runs_one_current_complete_key'::regclass,
        'sourcing_source_publications_one_current_key'::regclass
      )
    `;
    expect(predicates).toHaveLength(3);
    for (const { predicate } of predicates) {
      expect(schema.includes(`where: raw("${predicate}")`), predicate).toBe(true);
    }
  });

  it('reads the latest attempt and current COMPLETE from one snapshot while publication commits', async () => {
    // 서버 구동 원천(KID-360 I-b 전까지 run 표)의 상태 읽기.
    const writer = owner(prisma);
    const baseline = await begin(writer, 'status-baseline');
    await complete(writer, baseline);
    const refresh = await begin(writer, 'status-refresh');
    const latestRead = deferred();
    const published = deferred();

    // Delay real SQL at the client boundary to force a commit between the
    // two reads. No database responses or owner behavior are replaced.
    const readClient = prisma.$extends({ query: { sourcingEvidenceIngestionRun: {
      async findFirst({ args, query }) {
        if (args.where?.isCurrentComplete === true) {
          await published.promise;
          return query(args);
        }
        const row = await query(args);
        latestRead.resolve();
        return row;
      },
    } } });
    const reading = owner(readClient as unknown as PrismaClient).readSourceStatus(STATUS_QUERY);
    await latestRead.promise;
    try {
      await complete(writer, refresh);
    } finally {
      published.resolve();
    }

    await expect(reading).resolves.toMatchObject({
      ready: true,
      latestAttempt: { attemptId: refresh.attemptId, state: 'RUNNING' },
      latestComplete: { attemptId: baseline.attemptId, state: 'COMPLETE' },
    });
    await expect(writer.readSourceStatus(STATUS_QUERY)).resolves.toMatchObject({
      ready: true,
      latestAttempt: { attemptId: refresh.attemptId, state: 'COMPLETE' },
      latestComplete: { attemptId: refresh.attemptId, state: 'COMPLETE' },
    });
  });
});

const PLAN = { source: 'naver.keyword_analysis', inputHash: 'status' };
const STATUS_QUERY = { organizationId: TEST_ORGANIZATION_ID, sourceKey: 'naver.keyword_analysis', scopeKey: 'default',
  targetKey: 'status', currentPlanChecksum: 'p'.repeat(64) };

function owner(prisma: PrismaClient) {
  const db = prisma as unknown as PrismaService;
  return new SourcingBrowserSourceAttemptRepositoryAdapter(db, new SourceFailureAlerts(db), unusedSalesProductDraftPort);
}

async function begin(writer: SourcingBrowserSourceAttemptRepositoryAdapter, key: string) {
  return (await writer.beginAttempt({
    organizationId: TEST_ORGANIZATION_ID, sourceKey: STATUS_QUERY.sourceKey, scopeKey: 'default', targetKey: 'status',
    idempotencyKey: key, requestFingerprint: key.padEnd(64, '0'), plan: PLAN, planChecksum: STATUS_QUERY.currentPlanChecksum,
    requestedByUserId: null, collectorKey: 'status-test', collectorVersion: 'v1', expiresInMs: 60_000,
    failureAlert: { sourceType: STATUS_QUERY.sourceKey, dedupeKey: 'source:status', title: 't', href: '/' },
  })).attempt;
}

function complete(writer: SourcingBrowserSourceAttemptRepositoryAdapter, attempt: { attemptId: string; attemptToken: string; planChecksum: string }) {
  return writer.completeAttempt({ organizationId: TEST_ORGANIZATION_ID, attemptId: attempt.attemptId, attemptToken: attempt.attemptToken,
    planChecksum: attempt.planChecksum, contentChecksum: 'c'.repeat(64),
    output: { observations: [], typedRecords: [], discoveredCount: 0, rejectedCount: 0, qualityReport: {} } });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

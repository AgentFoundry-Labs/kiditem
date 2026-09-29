import { unusedSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sourcingServerOperations } from '../../test-helpers/sourcing-server-operations';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID } from '../../test-helpers/real-prisma';
import { SourcingServerOperationRepositoryAdapter } from '../adapter/out/persistence/sourcing-server-operation.repository';
import { SourcingSourcePublicationRepositoryAdapter } from '../adapter/out/persistence/sourcing-source-publication.repository';
import { SourcingServerOperationRunner } from '../application/service/sourcing-server-operation.runner';
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
        'sourcing_source_publications_one_current_key'::regclass
      )
    `;
    expect(predicates).toHaveLength(1);
    for (const { predicate } of predicates) {
      expect(schema.includes(`where: raw("${predicate}")`), predicate).toBe(true);
    }
  });

  it('최신 실행과 현재 발행은 한 DB 스냅숏에서 읽혀, 그 사이 발행이 커밋돼도 어긋나지 않는다(KID-389)', async () => {
    const { runner: writer, operations } = sourcingServerOperations(prisma, unusedSalesProductDraftPort);
    const baseline = await begin(writer, 'status-baseline');
    await complete(writer, baseline);
    const refresh = await begin(writer, 'status-refresh');
    const latestRead = deferred();
    const published = deferred();

    // Delay real SQL at the client boundary to force a commit between the
    // two reads. No database responses or owner behavior are replaced.
    const readClient = prisma.$extends({ query: {
      operation: {
        async findFirst({ args, query }) {
          const row = await query(args);
          latestRead.resolve();
          return row;
        },
      },
      sourcingSourcePublication: {
        async findFirst({ args, query }) {
          await published.promise;
          return query(args);
        },
      },
    } });
    const reader = new SourcingServerOperationRunner(operations,
      new SourcingServerOperationRepositoryAdapter(readClient as unknown as PrismaService,
        new SourcingSourcePublicationRepositoryAdapter(readClient as unknown as PrismaService)));
    const reading = reader.readSourceStatus(STATUS_QUERY);
    await latestRead.promise;
    try {
      await complete(writer, refresh);
    } finally {
      published.resolve();
    }

    await expect(reading).resolves.toMatchObject({
      ready: true,
      latestAttempt: { attemptId: refresh.attempt.attemptId, state: 'RUNNING' },
      latestComplete: { attemptId: baseline.attempt.attemptId, state: 'COMPLETE' },
    });
    await expect(writer.readSourceStatus(STATUS_QUERY)).resolves.toMatchObject({
      ready: true,
      latestAttempt: { attemptId: refresh.attempt.attemptId, state: 'COMPLETE' },
      latestComplete: { attemptId: refresh.attempt.attemptId, state: 'COMPLETE' },
    });
  });
});

const PLAN = { source: 'naver.keyword_analysis', inputHash: 'status' };
const STATUS_QUERY = { organizationId: TEST_ORGANIZATION_ID, kinds: ['sourcing.naver_keyword_analysis'] as const,
  sourceKey: 'naver.keyword_analysis', scopeKey: 'default', targetKey: 'status', currentPlanChecksum: 'a'.repeat(64) };

function begin(writer: SourcingServerOperationRunner, key: string) {
  return writer.begin({
    organizationId: TEST_ORGANIZATION_ID, userId: null, kind: 'sourcing.naver_keyword_analysis', requestIdempotencyKey: key,
    scope: { sourceKey: STATUS_QUERY.sourceKey, scopeKey: 'default', targetKey: 'status', requestFingerprint: key,
      attemptPlan: PLAN, planChecksum: STATUS_QUERY.currentPlanChecksum, collectorKey: 'status-test', collectorVersion: 'v1',
      failureAlert: { sourceType: STATUS_QUERY.sourceKey, dedupeKey: 'source:status', title: '상태 시험', href: '/' } },
  });
}

function complete(writer: SourcingServerOperationRunner, run: Awaited<ReturnType<typeof begin>>) {
  return writer.complete(TEST_ORGANIZATION_ID, run,
    { observations: [], typedRecords: [], discoveredCount: 0, rejectedCount: 0, qualityReport: {} },
    { contentChecksum: 'c'.repeat(64), windowStartAt: null, windowEndAt: null });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

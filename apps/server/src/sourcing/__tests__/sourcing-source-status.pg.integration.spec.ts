import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlertsRepository } from '../../alerts/alerts.repository';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID, TEST_USER_ID } from '../../test-helpers/real-prisma';
import { SourcingBrowserSourceAttemptController } from '../adapter/in/http/sourcing-browser-source-attempt.controller';
import { SourcingBrowserSourceAttemptRepositoryAdapter } from '../adapter/out/repository/sourcing-browser-source-attempt.repository.adapter';
import { SourcingBrowserSourceAttemptService } from '../application/service/sourcing-browser-source-attempt.service';
import type { PrismaClient } from '@prisma/client';
import type { AuthUser } from '../../auth/auth.types';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TrendCollectService } from '../application/service/trend-collect.service';

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
        'sourcing_evidence_ingestion_runs_one_current_complete_key'::regclass
      )
    `;
    expect(predicates).toHaveLength(2);
    for (const { predicate } of predicates) {
      expect(schema.includes(`where: raw("${predicate}")`), predicate).toBe(true);
    }
  });

  it('reads the latest attempt and current COMPLETE from one snapshot while publication commits', async () => {
    const writer = controller(prisma);
    const user = { id: TEST_USER_ID } as AuthUser;
    const batch = { keywords: [{ keyword: '铅笔', items: [] }] };
    const baseline = await writer.begin1688(TEST_ORGANIZATION_ID, user, 'status-baseline');
    await writer.complete1688(baseline.attemptId, baseline.attemptToken, batch, TEST_ORGANIZATION_ID);
    const refresh = await writer.begin1688(TEST_ORGANIZATION_ID, user, 'status-refresh');
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
    const reading = controller(readClient as unknown as PrismaClient).read1688Status(TEST_ORGANIZATION_ID);
    await latestRead.promise;
    try {
      await writer.complete1688(refresh.attemptId, refresh.attemptToken, batch, TEST_ORGANIZATION_ID);
    } finally {
      published.resolve();
    }

    await expect(reading).resolves.toMatchObject({
      status: 'READY',
      refreshing: true,
      latestAttempt: { attemptId: refresh.attemptId, state: 'RUNNING' },
      latestComplete: { attemptId: baseline.attemptId, state: 'COMPLETE' },
    });
    await expect(writer.read1688Status(TEST_ORGANIZATION_ID)).resolves.toMatchObject({
      status: 'READY',
      refreshing: false,
      latestAttempt: { attemptId: refresh.attemptId, state: 'COMPLETE' },
      latestComplete: { attemptId: refresh.attemptId, state: 'COMPLETE' },
    });
  });
});

function controller(prisma: PrismaClient) {
  const db = prisma as unknown as PrismaService;
  const owner = new SourcingBrowserSourceAttemptRepositoryAdapter(
    db, new SourceFailureAlerts(new AlertsRepository(db)),
  );
  const targets = { list1688Targets: async () => [{ label: '연필', keyword: '铅笔' }] };
  return new SourcingBrowserSourceAttemptController(new SourcingBrowserSourceAttemptService(
    owner, targets as unknown as TrendCollectService,
  ));
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

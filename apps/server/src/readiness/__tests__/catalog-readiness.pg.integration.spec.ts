import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import { ReadinessService } from '../readiness.service';
import { ChannelAccountService } from '../../channels/application/service/account/channel-account.service';
import { ChannelAccountPersistenceAdapter } from '../../channels/adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelCredentialsAdapter } from '../../channels/adapter/out/credentials/channel-credentials.adapter';
import { ChannelsProductMappingGenerationAdapter } from "../../channels/adapter/out/products/product-mapping-generation.adapter";
import { ProductMappingGenerationRepositoryAdapter } from "../../products/adapter/out/persistence/product-mapping-generation.repository.adapter";

const CATALOG_OWNER_PARSER = 'coupang-catalog-owner-v1';

describe('Coupang catalog readiness count over PostgreSQL', () => {
  let prisma: PrismaClient;
  let accountId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    accountId = (await prisma.channelAccount.create({
      data: {
        organizationId: ORG,
        channel: 'coupang',
        name: 'Wing',
        isPrimary: true,
        status: 'active',
      },
    })).id;
  });

  function catalogRun(data: {
    sourceType: string;
    status: string;
    parserVersion?: string;
    rootAttemptId?: string;
  }) {
    const { rootAttemptId, ...run } = data;
    return prisma.sourceImportRun.create({
      data: {
        organizationId: ORG,
        channelAccountId: accountId,
        importedAt: run.status === 'completed' ? new Date('2026-09-12T01:00:00.000Z') : null,
        ...(rootAttemptId
          ? { plan: { stage: 'details', rootAttemptId, basicAttemptId: rootAttemptId } }
          : {}),
        ...run,
      },
    });
  }

  it('counts listings of completed catalog runs and of the details child of a completed basics run only', async () => {
    const completedBasics = await catalogRun({
      sourceType: 'coupang_wing_catalog_basics',
      status: 'completed',
      parserVersion: CATALOG_OWNER_PARSER,
    });
    const failedBasics = await catalogRun({
      sourceType: 'coupang_wing_catalog_basics',
      status: 'failed',
      parserVersion: CATALOG_OWNER_PARSER,
    });
    const detailsOf = (rootAttemptId: string, status: string) => catalogRun({
      sourceType: 'coupang_wing_catalog_details',
      status,
      parserVersion: CATALOG_OWNER_PARSER,
      rootAttemptId,
    });
    const counted = [
      ['COMPLETED-LEGACY', await catalogRun({ sourceType: 'coupang_wing_catalog', status: 'completed' })],
      ['COMPLETED-BASICS', completedBasics],
      ['COMPLETED-DETAILS', await detailsOf(completedBasics.id, 'completed')],
      // Partial detail enrichment keeps the completed basics identity visible.
      ['RUNNING-DETAILS-OF-COMPLETED-BASICS', await detailsOf(completedBasics.id, 'running')],
      ['FAILED-DETAILS-OF-COMPLETED-BASICS', await detailsOf(completedBasics.id, 'failed')],
    ] as const;
    const notCounted = [
      ['RUNNING-LEGACY', await catalogRun({ sourceType: 'coupang_wing_catalog', status: 'running' })],
      ['FAILED-LEGACY', await catalogRun({ sourceType: 'coupang_wing_catalog', status: 'failed' })],
      ['RUNNING-BASICS', await catalogRun({
        sourceType: 'coupang_wing_catalog_basics',
        status: 'running',
        parserVersion: CATALOG_OWNER_PARSER,
      })],
      ['FAILED-BASICS', failedBasics],
      ['RUNNING-DETAILS-OF-FAILED-BASICS', await detailsOf(failedBasics.id, 'running')],
    ] as const;
    for (const [externalId, run] of [...counted, ...notCounted]) {
      await prisma.channelListing.create({
        data: {
          organizationId: ORG,
          channelAccountId: accountId,
          externalId,
          displayName: externalId,
          lastImportRunId: run.id,
          isActive: true,
        },
      });
    }

    const status = await new ReadinessService(
      prisma as never,
      new ChannelAccountService(
        new ChannelAccountPersistenceAdapter(prisma as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter())),
        new ChannelCredentialsAdapter(),
      ),
    ).getStatus(ORG);
    const products = status.checks.find((check) => check.key === 'coupang_products');

    expect(products).toMatchObject({
      count: counted.length,
      detail: `쿠팡 상품 ${counted.length}건 수집됨`,
    });
  });
});

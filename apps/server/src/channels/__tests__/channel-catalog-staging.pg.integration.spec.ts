import { ChannelIntegrityAdapter } from '../adapter/out/integrity/channel-integrity.adapter';
import { makeChannelListingQuery } from '../../test-helpers/channel-catalog-ports';
import { ListingContentQueryRepositoryAdapter } from '../../content/adapter/out/repository/listing-content-query.repository.adapter';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { AiCatalogMediaPublicationRepositoryAdapter } from '../../content/adapter/out/repository/ai-catalog-media-publication.repository.adapter';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import {
  ChannelCatalogCollectionService,
  hashCatalogChunkPayload,
} from '../application/service/collection/channel-catalog-collection.service';
import { ChannelCatalogCollectionRepositoryAdapter } from '../adapter/out/repository/channel-catalog-collection.repository.adapter';
import { ChannelCatalogPublicationRepositoryAdapter } from '../adapter/out/repository/channel-catalog-publication.repository.adapter';
import { ChannelOptionRecipeRepositoryAdapter } from '../adapter/out/persistence/channel-option-recipe.repository.adapter';
import { ChannelOptionRecipeService } from '../application/service/listing/channel-option-recipe.service';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { ChannelListingQueryService } from '../application/service/listing/channel-listing-query.service';
import { ChannelListingQueryPersistenceAdapter } from '../adapter/out/persistence/channel-listing-query.persistence.adapter';
import { lockProductMapping } from '../../common/product-mapping-generation';
import type {
  CoupangCatalogProductV1,
  PutCoupangCatalogChunkRequest,
} from '@kiditem/shared/coupang-catalog-snapshot';

const channelIntegrity = new ChannelIntegrityAdapter();

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const scope = { organizationId: ORG, channelAccountId: ACCOUNT };
describe('Wing catalog private staging and atomic publication (public service + PG)', () => {
  let prisma: PrismaClient;
  let collection: ChannelCatalogCollectionService;
  let alerts: SourceFailureAlerts;
  const tokens = new Map<string, string>();
  let listings: ChannelListingQueryService;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    alerts = new SourceFailureAlerts(prisma as never);
    const recipes = new ChannelOptionRecipeService(
      new ChannelOptionRecipeRepositoryAdapter(
        prisma as never,
        new ProductTransactionalReadRepositoryAdapter(),
      ),
    );
    const publisher = new ChannelCatalogPublicationRepositoryAdapter(
      prisma as never,
      new AiCatalogMediaPublicationRepositoryAdapter(makeChannelListingQuery(prisma)),
      alerts,
      recipes,
    );
    collection = new ChannelCatalogCollectionService(
      new ChannelCatalogCollectionRepositoryAdapter(prisma as never, alerts, publisher),
      publisher, channelIntegrity,
    );
    listings = new ChannelListingQueryService(new ChannelListingQueryPersistenceAdapter(prisma as never), new ListingContentQueryRepositoryAdapter(prisma as never));
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.create({
      data: {
        id: ACCOUNT,
        organizationId: ORG,
        channel: 'coupang',
        name: 'Wing',
        externalAccountId: 'vendor-primary',
        vendorId: 'vendor-primary',
      },
    });
  });
  const start = async (collectorVersion = 'wing-inventory-v1') => {
    const permit = await collection.start({
      ...scope,
      userId: USER,
      idempotencyKey: randomUUID(),
      request: { collectorVersion },
    });
    tokens.set(permit.attemptId, permit.attemptToken);
    return permit;
  };
  const current = () => listings.list(ORG, { channelAccountId: ACCOUNT });
  const upload = (
    runId: string,
    sequence: number,
    payload: PutCoupangCatalogChunkRequest['payload'],
  ) =>
    collection.putChunk({
      ...scope,
      userId: USER,
      runId,
      attemptToken: tokens.get(runId)!,
      kind: payload.kind,
      sequence,
      request: {
        kind: payload.kind,
        sequence,
        payload,
        checksum: hashCatalogChunkPayload(payload, channelIntegrity.sha256),
        itemCount:
          payload.kind === 'product_details'
            ? payload.products.length
            : payload.kind === 'discovery_page'
              ? payload.items.length
              : 1,
      } as PutCoupangCatalogChunkRequest,
    });
  async function stage(products: CoupangCatalogProductV1[], collectorVersion?: string) {
    const run = await start(collectorVersion);
    const manifest = {
      totalItems: products.length,
      pageSize: 100,
      expectedPages: Math.ceil(products.length / 100),
      firstPageFingerprint: 'a'.repeat(64),
    };
    for (let offset = 0; offset < products.length; offset += 100) {
      await upload(run.attemptId, offset / 100 + 1, {
        version: 1,
        kind: 'discovery_page',
        page: offset / 100 + 1,
        manifest,
        items: products.slice(offset, offset + 100).map((p, index) => ({
          ordinal: offset + index,
          externalProductId: p.externalProductId,
          registeredName: p.registeredName,
          primaryImageUrl: null,
          saleStatus: null,
        })),
      });
    }
    for (let offset = 0; offset < products.length; offset += 10) {
      await upload(run.attemptId, offset + 1, {
        version: 1,
        kind: 'product_details',
        startOrdinal: offset,
        products: products
          .slice(offset, offset + 10)
          .map((p, index) => ({ ordinal: offset + index, product: p })),
      });
    }
    return upload(run.attemptId, 1, {
      version: 1,
      kind: 'manifest_confirmation',
      manifest,
    });
  }
  const finalize = (runId: string, snapshotHash: string) =>
    collection.finalize({
      ...scope,
      userId: USER,
      runId,
      attemptToken: tokens.get(runId)!,
      request: { snapshotHash },
    });
  it('accepts product details privately without changing visible catalog or media', async () => {
    const run = await start();
    const payload = {
      version: 1 as const,
      kind: 'product_details' as const,
      startOrdinal: 0,
      products: [{ ordinal: 0, product: product('P1') }],
    };
    const before = await current();
    const accepted = await upload(run.attemptId, 1, payload);
    expect(accepted.progress).toMatchObject({
      hydratedProducts: 1,
      publishedProducts: 0,
      publishedOptionCount: 0,
      publishedMediaCount: 0,
      publishedChunks: 0,
      firstPublishedAt: null,
      lastPublishedAt: null,
    });
    expect(await current()).toEqual(before);
    await upload(run.attemptId, 1, payload);
    expect(await current()).toEqual(before);
  });
  it('publishes the full staged view once and rejects a conflicting final receipt', async () => {
    const ready = await stage([product('P1'), product('P2')]);
    expect(ready.phase).toBe('ready_to_finalize');
    expect((await current()).total).toBe(0);
    const [complete, concurrentReplay] = await Promise.all([
      finalize(ready.attemptId, ready.snapshotHash!),
      finalize(ready.attemptId, ready.snapshotHash!),
    ]);
    expect(concurrentReplay).toEqual(complete);
    expect(complete.state).toBe('COMPLETE');
    expect(complete.progress).toMatchObject({
      publishedProducts: 2,
      publishedOptionCount: 2,
      publishedMediaCount: 2,
      firstPublishedAt: complete.finishedAt,
      lastPublishedAt: complete.finishedAt,
    });
    const visible = await current();
    expect(visible.total).toBe(2);
    expect(visible.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalId: 'P1',
          thumbnailUrl: 'https://example.com/P1.jpg',
        }),
        expect.objectContaining({
          externalId: 'P2',
          thumbnailUrl: 'https://example.com/P2.jpg',
        }),
      ]),
    );
    const replay = await finalize(ready.attemptId, ready.snapshotHash!);
    expect(replay).toEqual(complete);
    expect(await current()).toEqual(visible);
    await expect(finalize(ready.attemptId, 'b'.repeat(64))).rejects.toMatchObject({
      kind: 'conflict',
    });
    expect(await current()).toEqual(visible);
  });
  it('publishes a new A → B → A collection instead of returning a historical receipt', async () => {
    const a = [product('P1'), product('P2')];
    const first = await stage(a);
    const firstComplete = await finalize(first.attemptId, first.snapshotHash!);
    const second = await stage([product('P3')]);
    const secondComplete = await finalize(second.attemptId, second.snapshotHash!);
    expect((await current()).items.map((item) => item.externalId)).toEqual(['P3']);
    const third = await stage(a);
    const thirdComplete = await finalize(third.attemptId, third.snapshotHash!);
    expect(thirdComplete.publication).toMatchObject({ duplicate: false });
    expect(thirdComplete.publication!.sourceImportRunId).not.toBe(
      firstComplete.publication!.sourceImportRunId,
    );
    expect((await current()).items.map((item) => item.externalId).sort()).toEqual(['P1', 'P2']);
    const receipts = [firstComplete, secondComplete, thirdComplete].map(
      (run) => run.publication!.sourceImportRunId,
    );
    const imports = await prisma.sourceImportRun.findMany({
      where: { organizationId: ORG, id: { in: receipts } },
      orderBy: { publicationSequence: 'asc' },
    });
    expect(imports.map((run) => run.publicationSequence)).toEqual([1n, 2n, 3n]);
    expect(imports.map((run) => run.fileHash)).toEqual([null, null, null]);
    expect(imports.map((run) => run.contentChecksum)).toEqual([
      first.snapshotHash,
      second.snapshotHash,
      third.snapshotHash,
    ]);
    expect(await finalize(third.attemptId, third.snapshotHash!)).toEqual(thirdComplete);
  });

  it('rejects receipts appended after final selection while waiting for the publication fence', async () => {
    const ready = await stage([product('P1')]);
    let unlock!: () => void;
    let locked!: () => void;
    const acquired = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const blocker = prisma.$transaction(
      async (tx) => {
        await lockProductMapping(tx, ORG);
        locked();
        await release;
      },
      { timeout: 10_000 },
    );
    await acquired;
    const publishing = finalize(ready.attemptId, ready.snapshotHash!).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    try {
      await expect
        .poll(
          async () => {
            const waiting = await prisma.$queryRaw<
              Array<{ count: number }>
            >`SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
            return waiting[0]?.count;
          },
          { timeout: 3000 },
        )
        .toBeGreaterThan(0);
      await expect(
        upload(ready.attemptId, 2, {
          version: 1,
          kind: 'product_details',
          startOrdinal: 1,
          products: [{ ordinal: 1, product: product('P2') }],
        }),
      ).rejects.toMatchObject({
        message: 'Hydrated product does not match discovery ordinal 1',
      });
    } finally {
      unlock();
      await blocker;
    }
    expect(await publishing).toMatchObject({ error: { status: 409 } });
    expect((await current()).total).toBe(0);
  });
  it('keeps the previous catalog and selected media when an incomplete final is rejected', async () => {
    const baseline = await stage([product('P1')]);
    await finalize(baseline.attemptId, baseline.snapshotHash!);
    const visible = await current();
    const partial = await start();
    await upload(partial.attemptId, 1, {
      version: 1,
      kind: 'product_details',
      startOrdinal: 0,
      products: [{ ordinal: 0, product: product('P2') }],
    });
    await expect(finalize(partial.attemptId, 'b'.repeat(64))).rejects.toMatchObject({
      kind: 'invalid',
    });
    expect(await current()).toEqual(visible);
    expect(
      (await collection.getStatus({ ...scope, runId: partial.attemptId })).progress
        .publishedProducts,
    ).toBe(0);
  });
  it.each([{ checksum: '0'.repeat(64) }, { itemCount: 2 }])(
    'revalidates the stored receipt %j before canonical writes',
    async (corruption) => {
      const ready = await stage([product('P1')]);
      await prisma.channelScrapeChunk.updateMany({
        where: {
          organizationId: ORG,
          scrapeRun: { sourceImportRunId: ready.attemptId },
          kind: 'product_details',
        },
        data: corruption,
      });
      await expect(finalize(ready.attemptId, ready.snapshotHash!)).rejects.toMatchObject({
        status: 409,
      });
      expect((await current()).total).toBe(0);
    },
  );
  it('rolls back canonical identity and media work when the final collection write fails', async () => {
    const baseline = await stage([product('P1'), product('P2')]);
    await finalize(baseline.attemptId, baseline.snapshotHash!);
    const visible = await current();
    const replacement = product('P1', 'replacement');
    replacement.media[0]!.sourceUrl = 'https://example.com/replacement.jpg';
    const ready = await stage([replacement, product('P3')], 'test_rollback');
    await prisma.$executeRaw`ALTER TABLE source_import_runs ADD CONSTRAINT test_reject_catalog_completion CHECK ((plan->>'collectorVersion') <> 'test_rollback' OR status <> 'completed')`;
    try {
      await expect(finalize(ready.attemptId, ready.snapshotHash!)).rejects.toThrow();
      expect(await current()).toEqual(visible);
      expect((await collection.getStatus({ ...scope, runId: ready.attemptId })).state).toBe(
        'RUNNING',
      );
    } finally {
      await prisma.$executeRaw`ALTER TABLE source_import_runs DROP CONSTRAINT test_reject_catalog_completion`;
    }
    expect((await finalize(ready.attemptId, ready.snapshotHash!)).state).toBe('COMPLETE');
    expect(await current()).not.toEqual(visible);
  });
  it('measures a full finalization of 1000 products, 3000 options and 1000 media', async () => {
    const products = Array.from({ length: 1000 }, (_, i) => {
      const p = product(`P${i}`);
      p.options = Array.from({ length: 3 }, (_, j) => ({
        ...p.options[0]!,
        externalOptionId: `P${i}-O${j}`,
      }));
      return p;
    });
    const ready = await stage(products);
    // makeTestPrisma above has already validated this disposable harness URL.
    const measured = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
      log: [{ emit: 'event', level: 'query' }],
    });
    const statements: string[] = [];
    measured.$on('query', (event) => {
      statements.push(event.query);
    });
    const measuredPublisher = new ChannelCatalogPublicationRepositoryAdapter(
      measured as never,
      new AiCatalogMediaPublicationRepositoryAdapter(makeChannelListingQuery(prisma)),
      alerts,
      new ChannelOptionRecipeService(
        new ChannelOptionRecipeRepositoryAdapter(
          measured as never,
          new ProductTransactionalReadRepositoryAdapter(),
        ),
      ),
    );
    const owner = new ChannelCatalogCollectionService(
      new ChannelCatalogCollectionRepositoryAdapter(measured as never, alerts, measuredPublisher),
      measuredPublisher, channelIntegrity,
    );
    try {
      const started = performance.now();
      const result = await owner.finalize({
        ...scope,
        userId: USER,
        runId: ready.attemptId,
        attemptToken: tokens.get(ready.attemptId)!,
        request: { snapshotHash: ready.snapshotHash! },
      });
      const elapsedMs = Math.round(performance.now() - started);
      process.stdout.write(
        `WING_FULL_FINALIZATION_MEASUREMENT ${JSON.stringify({
          products: 1000,
          options: 3000,
          media: 1000,
          elapsedMs,
          statements: statements.length,
          contentStatements: statements.filter((sql) =>
            /content_workspaces|content_assets|content_generation_groups|content_workspace_thumbnail_selections/.test(
              sql,
            ),
          ).length,
        })}\n`,
      );
      expect(statements.length).toBeLessThan(100);
      expect(result.progress).toMatchObject({
        publishedProducts: 1000,
        publishedOptionCount: 3000,
        publishedMediaCount: 1000,
      });
      expect((await current()).total).toBe(1000);
      const refresh = await stage(products);
      statements.length = 0;
      const refreshStarted = performance.now();
      const refreshed = await owner.finalize({
        ...scope,
        userId: USER,
        runId: refresh.attemptId,
        attemptToken: tokens.get(refresh.attemptId)!,
        request: { snapshotHash: refresh.snapshotHash! },
      });
      process.stdout.write(
        `WING_FULL_REFRESH_MEASUREMENT ${JSON.stringify({
          products: 1000,
          options: 3000,
          media: 1000,
          elapsedMs: Math.round(performance.now() - refreshStarted),
          statements: statements.length,
          contentStatements: statements.filter((sql) =>
            /content_workspaces|content_assets|content_generation_groups|content_workspace_thumbnail_selections/.test(
              sql,
            ),
          ).length,
        })}\n`,
      );
      expect(statements.length).toBeLessThan(100);
      expect(refreshed.progress.publishedProducts).toBe(1000);
      expect(refreshed.publication!.sourceImportRunId).not.toBe(
        result.publication!.sourceImportRunId,
      );
      expect((await current()).total).toBe(1000);
    } finally {
      await measured.$disconnect();
    }
  }, 120_000);
});

function product(id: string, name = id): CoupangCatalogProductV1 {
  return {
    externalProductId: id,
    registeredName: name,
    displayName: name,
    category: '완구',
    manufacturer: '제조사',
    brand: '브랜드',
    productStatus: '승인완료',
    options: [
      {
        externalOptionId: `${id}-O1`,
        optionName: '기본',
        skuStatus: '판매중',
        salePrice: 12900,
        sellerSku: `${id}-SKU`,
        modelNumber: null,
        barcode: null,
        attributes: [],
        media: [],
        raw: {},
      },
    ],
    media: [
      {
        sourceUrl: `https://example.com/${id}.jpg`,
        role: 'primary',
        sortOrder: 0,
        externalOptionId: null,
      },
    ],
    raw: {},
  };
}

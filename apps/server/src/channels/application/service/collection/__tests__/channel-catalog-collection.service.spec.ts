import { ChannelIntegrityAdapter } from '../../../../adapter/out/integrity/channel-integrity.adapter';
import { ChannelInputError as BadRequestException } from '../../../../domain/exception/channel-business-error';
import { describe, expect, it, vi } from 'vitest';
import { ChannelCatalogCollectionService } from '../channel-catalog-collection.service';
import {
  hashCatalogChunkPayload,
  hashCatalogStageSnapshot,
} from '../../../../domain/collection/catalog-collection-hash';
import type { ChannelCatalogCollectionRepositoryPort } from '../../../port/out/repository/channel-catalog-collection.repository.port';
import type { ChannelCatalogPublicationPort } from '../../../port/out/repository/channel-catalog-publication.port';

const channelIntegrity = new ChannelIntegrityAdapter();

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000003';
const RUN_ID = '00000000-0000-4000-8000-000000000004';
const CLIENT_RUN_KEY = '00000000-0000-4000-8000-000000000005';
const DETAILS_RUN_ID = '00000000-0000-4000-8000-000000000006';
const DETAILS_KEY = '00000000-0000-4000-8000-000000000007';

describe('ChannelCatalogCollectionService', () => {
  it('preserves the UTF-8 stage receipt hash independently of product input order', () => {
    expect(hashCatalogStageSnapshot([
      { ordinal: 1, product: { id: '나' } },
      { ordinal: 0, product: { id: '가' } },
    ], channelIntegrity.sha256)).toBe('ec56cdc5b9a98cab8c5d2f380db6574b16d4dddc67a17954d9bbc387ba657a96');
  });

  it('starts or resumes an account-scoped run and derives discovery progress', async () => {
    const repository = makeRepository();
    const service = new ChannelCatalogCollectionService(repository, makePublisher(), channelIntegrity);

    const result = await service.start({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      channelAccountId: ACCOUNT_ID,
      idempotencyKey: CLIENT_RUN_KEY,
      request: {
        collectorVersion: 'wing-inventory-v1',
        stage: 'basics',
      },
    });

    expect(repository.startOrResume).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      channelAccountId: ACCOUNT_ID,
      idempotencyKey: CLIENT_RUN_KEY,
      collectorVersion: 'wing-inventory-v1',
      stage: 'basics',
    });
    expect(result).toMatchObject({
      attemptId: RUN_ID,
      state: 'RUNNING',
    });
  });

  it('forwards the exact basics basis when admitting a details child', async () => {
    const repository = makeRepository();
    const service = new ChannelCatalogCollectionService(repository, makePublisher(), channelIntegrity);
    const expectedBasicAttemptId = '00000000-0000-4000-8000-000000000007';

    await service.start({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      channelAccountId: ACCOUNT_ID,
      idempotencyKey: CLIENT_RUN_KEY,
      request: {
        collectorVersion: 'wing-inventory-v1',
        stage: 'details',
        expectedBasicAttemptId,
      },
    });

    expect(repository.startOrResume).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      channelAccountId: ACCOUNT_ID,
      idempotencyKey: CLIENT_RUN_KEY,
      collectorVersion: 'wing-inventory-v1',
      stage: 'details',
      expectedBasicAttemptId,
    });
  });

  it('records a recoverable Wing pause without changing the RUNNING owner state', async () => {
    const repository = makeRepository();
    repository.getOwnedRunWithChunks.mockResolvedValue({
      ...runWithChunks([]),
      errorJson: {
        code: 'WING_PROVIDER_RATE_LIMITED',
        message: 'Wing rate limit',
        phase: 'hydration',
        recoverable: true,
        notBefore: '2026-09-09T00:00:00.000Z',
      },
    });
    const service = new ChannelCatalogCollectionService(repository, makePublisher(), channelIntegrity);
    const request = {
      code: 'WING_PROVIDER_RATE_LIMITED' as const,
      message: 'Wing rate limit',
      phase: 'hydration' as const,
      recoverable: true as const,
      notBefore: '2026-09-09T00:00:00.000Z',
    };

    const result = await service.pause({
      ...ownedInput(),
      request,
    });

    expect(repository.markPaused).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      channelAccountId: ACCOUNT_ID,
      runId: RUN_ID,
      attemptToken: CLIENT_RUN_KEY,
      error: request,
    });
    expect(result.state).toBe('RUNNING');
    expect(result.error).toEqual(request);
  });

  it('reports missing pages and products entirely from durable chunks', async () => {
    const repository = makeRepository();
    repository.getOwnedRunWithChunks.mockResolvedValue(
      runWithChunks([
        discoveryChunk(1, [
          {
            ordinal: 0,
            externalProductId: 'P-1',
            registeredName: '첫 상품',
            primaryImageUrl: null,
          },
          {
            ordinal: 1,
            externalProductId: 'P-2',
            registeredName: '둘째 상품',
            primaryImageUrl: null,
          },
        ]),
        productChunk(0, ['P-1']),
      ]),
    );
    const service = new ChannelCatalogCollectionService(repository, makePublisher(), channelIntegrity);

    const result = await service.getStatus(ownedInput());

    expect(result.phase).toBe('discovery');
    expect(result.progress).toMatchObject({
      discoveryPagesStored: 1,
      discoveredProducts: 2,
      hydratedProducts: 1,
      optionCount: 1,
      mediaCount: 1,
      storedChunks: 2,
      publishedProducts: 0,
      publishedOptionCount: 0,
      publishedMediaCount: 0,
      publishedChunks: 0,
      firstPublishedAt: null,
      lastPublishedAt: null,
    });
    expect(result.missing).toEqual({
      discoverySequences: [2],
      productIds: ['P-2'],
    });
  });

  it.each(['basics', 'details'] as const)(
    'keeps compact %s status counts and phase equal to the full payload status',
    async (stage) => {
      const fullRun = stagedReadyRun(stage);
      const compactRun = {
        ...fullRun,
        chunks: compactChunks(fullRun.chunks),
      };
      const compactRepository = makeRepository();
      compactRepository.getOwnedRunWithChunks.mockImplementation(async ({ includePayload }) =>
        (includePayload ? fullRun : compactRun) as never,
      );
      const compactResult = await new ChannelCatalogCollectionService(
        compactRepository,
        makePublisher(), channelIntegrity,
      ).getStatus(ownedInput());

      const fullRepository = makeRepository();
      fullRepository.getOwnedRunWithChunks.mockResolvedValue(fullRun as never);
      const fullResult = await new ChannelCatalogCollectionService(
        fullRepository,
        makePublisher(), channelIntegrity,
      ).getStatus(ownedInput());

      expect(compactResult.phase).toBe('ready_to_finalize');
      expect(compactResult.phase).toBe(fullResult.phase);
      expect(compactResult.progress).toEqual(fullResult.progress);
      expect(compactResult.manifest).toEqual(fullResult.manifest);
      expect(compactResult.snapshotHash).toBe(fullResult.snapshotHash);
      expect(compactRepository.getOwnedRunWithChunks).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ includePayload: false }),
      );
      expect(compactRepository.getOwnedRunWithChunks).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ includePayload: true }),
      );
    },
  );

  it.each(['running', 'completed'] as const)(
    'does not reload full payloads for %s compact status',
    async (status) => {
      const run = {
        ...runRecord(),
        status,
        chunks: compactChunks([
          discoveryChunk(1, [
            {
              ordinal: 0,
              externalProductId: 'P-1',
              registeredName: '상품',
              primaryImageUrl: null,
            },
          ],
          onePageManifest(),
        ),
        ]),
      };
      const repository = makeRepository();
      repository.getOwnedRunWithChunks.mockResolvedValue(run as never);

      const result = await new ChannelCatalogCollectionService(
        repository,
        makePublisher(), channelIntegrity,
      ).getStatus(ownedInput());

      expect(result.state).toBe(status === 'completed' ? 'COMPLETE' : 'RUNNING');
      expect(repository.getOwnedRunWithChunks).toHaveBeenCalledTimes(1);
      expect(repository.getOwnedRunWithChunks).toHaveBeenCalledWith(
        expect.objectContaining({ includePayload: false }),
      );
    },
  );

  it.each(['completed', 'failed'] as const)(
    'projects the linked details %s state onto a completed basics root',
    async (childStatus) => {
      const root = {
        ...runRecord(),
        status: 'completed',
        finishedAt: new Date('2026-07-14T00:10:00.000Z'),
        stage: 'basics' as const,
        plan: {
          ...runRecord().plan,
          stage: 'basics' as const,
          rootAttemptId: RUN_ID,
          detailsIdempotencyKey: DETAILS_KEY,
        },
      };
      const child = {
        ...runRecord(),
        id: DETAILS_RUN_ID,
        collectionRunId: DETAILS_RUN_ID,
        idempotencyKey: DETAILS_KEY,
        status: childStatus,
        finishedAt: childStatus === 'completed'
          ? new Date('2026-07-14T00:20:00.000Z')
          : null,
        stage: 'details' as const,
        plan: {
          ...runRecord().plan,
          stage: 'details' as const,
          rootAttemptId: RUN_ID,
          basicAttemptId: RUN_ID,
        },
        errorJson: childStatus === 'failed'
          ? { code: 'PROVIDER_ERROR', message: 'Details stopped', phase: 'discovery' }
          : null,
        chunks: [],
      };
      const repository = makeRepository();
      repository.getOwnedRunWithChunks.mockResolvedValue({ ...root, chunks: [] } as never);
      repository.getOwnedDetailsChild.mockResolvedValue(child as never);
      const service = new ChannelCatalogCollectionService(repository, makePublisher(), channelIntegrity);

      const result = await service.getStatus(ownedInput());

      expect(repository.getOwnedDetailsChild).toHaveBeenCalledWith({
        organizationId: ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        rootAttemptId: RUN_ID,
        detailsIdempotencyKey: DETAILS_KEY,
        includePayload: false,
      });
      expect(result).toMatchObject({
        state: 'COMPLETE',
        rootAttemptId: RUN_ID,
        currentAttemptId: DETAILS_RUN_ID,
        currentStage: 'details',
        overallState: childStatus === 'completed' ? 'COMPLETE' : 'FAILED',
      });
    },
  );

  it('does not keep an unadmitted details handoff running after the basics owner expires', async () => {
    const root = {
      ...runRecord(),
      status: 'completed',
      expiresAt: new Date('2026-07-13T23:59:59.000Z'),
      finishedAt: new Date('2026-07-13T23:00:00.000Z'),
      stage: 'basics' as const,
      plan: {
        ...runRecord().plan,
        stage: 'basics' as const,
        rootAttemptId: RUN_ID,
        detailsIdempotencyKey: DETAILS_KEY,
      },
      chunks: [],
    };
    const repository = makeRepository();
    repository.getOwnedRunWithChunks.mockResolvedValue(root as never);
    const service = new ChannelCatalogCollectionService(repository, makePublisher(), channelIntegrity);

    const result = await service.getStatus(ownedInput());

    expect(repository.getOwnedDetailsChild).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      channelAccountId: ACCOUNT_ID,
      rootAttemptId: RUN_ID,
      detailsIdempotencyKey: DETAILS_KEY,
      includePayload: false,
    });
    expect(result).toMatchObject({
      state: 'COMPLETE',
      currentAttemptId: RUN_ID,
      currentStage: 'basics',
      overallState: 'FAILED',
    });
  });

  it('recomputes a canonical payload checksum before accepting a chunk', async () => {
    const repository = makeRepository();
    const service = new ChannelCatalogCollectionService(repository, makePublisher(), channelIntegrity);
    const payload = discoveryPayload(1, [
      {
        ordinal: 0,
        externalProductId: 'P-1',
        registeredName: '상품',
        primaryImageUrl: null,
      },
    ]);

    await service.putChunk({
      ...ownedInput(),
      userId: USER_ID,
      kind: 'discovery_page',
      sequence: 1,
      request: {
        kind: 'discovery_page',
        sequence: 1,
        checksum: hashCatalogChunkPayload(payload, channelIntegrity.sha256),
        itemCount: 1,
        payload,
      },
    });

    expect(repository.putChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: RUN_ID,
        checksum: hashCatalogChunkPayload(payload, channelIntegrity.sha256),
        payload,
      }),
    );
  });

  it('keeps fully staged details ready to finalize and out of published progress', async () => {
    const repository = makeRepository();
    repository.getOwnedRunWithChunks.mockResolvedValue(
      runWithChunks([
        discoveryChunk(
          1,
          [
            {
              ordinal: 0,
              externalProductId: 'P-1',
              registeredName: '상품',
              primaryImageUrl: null,
            },
          ],
          onePageManifest(),
        ),
        productChunk(0, ['P-1']),
        confirmationChunk(onePageManifest()),
      ]),
    );
    const service = new ChannelCatalogCollectionService(repository, makePublisher(), channelIntegrity);

    const result = await service.getStatus(ownedInput());

    expect(result.phase).toBe('ready_to_finalize');
    expect(result.progress).toMatchObject({
      hydratedProducts: 1,
      publishedProducts: 0,
      publishedOptionCount: 0,
      publishedMediaCount: 0,
      publishedChunks: 0,
      firstPublishedAt: null,
      lastPublishedAt: null,
    });
    expect(result.missing.productIds).toEqual([]);
  });

  it.each(['running', 'paused', 'failed', 'completed'] as const)(
    'counts staged details as hydrated and published only after the terminal commit while the run is %s (KID-348)',
    async (state) => {
      const firstPublishedAt = new Date('2026-07-14T00:18:40.000Z');
      const secondPublishedAt = new Date('2026-07-14T00:20:53.000Z');
      const manifest = { ...onePageManifest(), totalItems: 2 };
      const first = publishedFullDetailsChunk({
        id: 'details-published-1',
        sequence: 1,
        ordinal: 0,
        externalProductId: 'P-1',
        optionCount: 2,
        mediaCount: 3,
        publishedAt: firstPublishedAt,
      });
      const second = publishedFullDetailsChunk({
        id: 'details-published-2',
        sequence: 2,
        ordinal: 1,
        externalProductId: 'P-2',
        optionCount: 1,
        mediaCount: 2,
        publishedAt: secondPublishedAt,
      });
      const run = {
        ...runRecord(),
        status: state === 'completed' ? 'completed' : state === 'failed' ? 'failed' : 'running',
        finishedAt: state === 'completed' ? secondPublishedAt : null,
        errorJson: state === 'paused'
          ? {
              code: 'WING_PROVIDER_RATE_LIMITED',
              message: 'Wing rate limit',
              phase: 'hydration',
              recoverable: true,
              notBefore: '2026-07-14T00:30:00.000Z',
            }
          : state === 'failed'
            ? {
                code: 'PROVIDER_ERROR',
                message: 'Collection stopped',
                phase: 'hydration',
              }
            : null,
        stage: 'details' as const,
        plan: {
          ...runRecord().plan,
          stage: 'details' as const,
          basicAttemptId: RUN_ID,
          basicManifestHash: 'a'.repeat(64),
          basicPublicationSequence: '1',
          basicProductIds: ['P-1', 'P-2'],
        },
        chunks: [
          discoveryChunk(1, [
            {
              ordinal: 0,
              externalProductId: 'P-1',
              registeredName: '상품 1',
              primaryImageUrl: null,
            },
            {
              ordinal: 1,
              externalProductId: 'P-2',
              registeredName: '상품 2',
              primaryImageUrl: null,
            },
          ], manifest),
          first,
          ...(state === 'completed' ? [second] : [unpublishedFullDetailsChunk({
            id: 'details-stored-only',
            sequence: 2,
            ordinal: 1,
            externalProductId: 'P-2',
          })]),
          detailConfirmationChunk(manifest),
        ],
      };
      const repository = makeRepository();
      repository.getOwnedRunWithChunks.mockResolvedValue(run as never);
      const service = new ChannelCatalogCollectionService(repository, makePublisher(), channelIntegrity);

      const result = await service.getStatus(ownedInput());
      const completed = state === 'completed';
      expect(result.progress).toMatchObject({
        hydratedProducts: 2,
        publishedProducts: completed ? 2 : 0,
        publishedChunks: completed ? 2 : 0,
        firstPublishedAt: completed ? secondPublishedAt.toISOString() : null,
        lastPublishedAt: completed ? secondPublishedAt.toISOString() : null,
      });
      expect(firstPublishedAt).toBeInstanceOf(Date);
      expect((await service.getStatus(ownedInput())).progress).toEqual(result.progress);
    },
  );

  it('keeps compact receipt progress equal to full', async () => {
    const manifest = { ...onePageManifest(), totalItems: 1 };
    const published = publishedFullDetailsChunk({
      id: 'details-published',
      sequence: 1,
      ordinal: 0,
      externalProductId: 'P-1',
      optionCount: 1,
      mediaCount: 1,
      publishedAt: new Date('2026-07-14T00:18:40.000Z'),
    });
    const fullRun = {
      ...runRecord(),
      stage: 'details' as const,
      plan: {
        ...runRecord().plan,
        stage: 'details' as const,
        basicAttemptId: RUN_ID,
        basicManifestHash: 'a'.repeat(64),
        basicPublicationSequence: '1',
        basicProductIds: ['P-1'],
      },
      chunks: [
        discoveryChunk(1, [{
          ordinal: 0,
          externalProductId: 'P-1',
          registeredName: '상품',
          primaryImageUrl: null,
        }], manifest),
        published,
        detailConfirmationChunk(manifest),
      ],
    };
    const compactRepository = makeRepository();
    compactRepository.getOwnedRunWithChunks.mockResolvedValue({
      ...fullRun,
      chunks: compactChunks(fullRun.chunks),
    } as never);
    const compactResult = await new ChannelCatalogCollectionService(
      compactRepository,
      makePublisher(), channelIntegrity,
    ).getStatus(ownedInput());
    const fullRepository = makeRepository();
    fullRepository.getOwnedRunWithChunks.mockResolvedValue(fullRun as never);
    const fullResult = await new ChannelCatalogCollectionService(
      fullRepository,
      makePublisher(), channelIntegrity,
    ).getStatus(ownedInput());
    expect(compactResult.progress).toEqual(fullResult.progress);
  });

  it('rejects a checksum mismatch before writing JSONB', async () => {
    const repository = makeRepository();
    const service = new ChannelCatalogCollectionService(repository, makePublisher(), channelIntegrity);
    const payload = discoveryPayload(1, [
      {
        ordinal: 0,
        externalProductId: 'P-1',
        registeredName: '상품',
        primaryImageUrl: null,
      },
    ]);

    await expect(
      service.putChunk({
        ...ownedInput(),
        userId: USER_ID,
        kind: 'discovery_page',
        sequence: 1,
        request: {
          kind: 'discovery_page',
          sequence: 1,
          checksum: 'f'.repeat(64),
          itemCount: 1,
          payload,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.putChunk).not.toHaveBeenCalled();
  });

  it('blocks finalize until discovery, hydration, and manifest confirmation are complete', async () => {
    const repository = makeRepository();
    repository.getOwnedRunWithChunks.mockResolvedValue(
      runWithChunks([
        discoveryChunk(1, [
          {
            ordinal: 0,
            externalProductId: 'P-1',
            registeredName: '상품',
            primaryImageUrl: null,
          },
        ]),
      ]),
    );
    const publisher = makePublisher();
    const service = new ChannelCatalogCollectionService(repository, publisher, channelIntegrity);

    await expect(
      service.finalize({
        ...ownedInput(),
        userId: USER_ID,
        request: { snapshotHash: 'a'.repeat(64) },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('exposes the server canonical hash when a resumable snapshot is ready', async () => {
    const repository = makeRepository();
    const stagedProduct = productChunk(0, ['P-1']).payload.products[0]!;
    const chunks = [
      discoveryChunk(
        1,
        [
          {
            ordinal: 0,
            externalProductId: 'P-1',
            registeredName: '상품',
            primaryImageUrl: null,
            saleStatus: '판매중',
          },
        ],
        onePageManifest(),
      ),
      productChunk(0, ['P-1']),
      confirmationChunk(onePageManifest()),
    ];
    repository.getOwnedRunWithChunks.mockResolvedValue(runWithChunks(chunks));
    const service = new ChannelCatalogCollectionService(repository, makePublisher(), channelIntegrity);

    const result = await service.getStatus(ownedInput());

    expect(result.phase).toBe('ready_to_finalize');
    expect(result.snapshotHash).toBe(hashCatalogStageSnapshot([stagedProduct], channelIntegrity.sha256));
  });

  it('publishes one complete canonical snapshot with the server-computed hash', async () => {
    const repository = makeRepository();
    const stagedProduct = productChunk(0, ['P-1']).payload.products[0]!;
    const chunks = [
      discoveryChunk(
        1,
        [
          {
            ordinal: 0,
            externalProductId: 'P-1',
            registeredName: '상품',
            primaryImageUrl: null,
            saleStatus: '판매중',
          },
        ],
        onePageManifest(),
      ),
      productChunk(0, ['P-1']),
      confirmationChunk(onePageManifest()),
    ];
    repository.getOwnedRunWithChunks.mockResolvedValue(runWithChunks(chunks));
    const publisher = makePublisher();
    const service = new ChannelCatalogCollectionService(repository, publisher, channelIntegrity);
    const snapshotHash = hashCatalogStageSnapshot([stagedProduct], channelIntegrity.sha256);

    await service.finalize({
      ...ownedInput(),
      userId: USER_ID,
      request: { snapshotHash },
    });

    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        collectionRunId: RUN_ID,
        snapshotHash,
        chunkSetHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });
});

describe('ChannelCatalogCollectionService operator stop and source read', () => {
  it('stops an attempt through the owner transaction and answers the stopped attempt view', async () => {
    const repository = makeRepository();
    repository.getOwnedRunWithChunks.mockResolvedValue({
      ...runWithChunks([]),
      status: 'failed',
      errorJson: { code: 'USER_CANCELLED', message: '운영자가 수집을 중단했습니다.', phase: 'discovery' },
    });
    const service = new ChannelCatalogCollectionService(repository, makePublisher(), channelIntegrity);
    const input = {
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      channelAccountId: ACCOUNT_ID,
      runId: RUN_ID,
    };

    const result = await service.cancel(input);

    expect(repository.cancel).toHaveBeenCalledWith(input);
    expect(repository.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      repository.getOwnedRunWithChunks.mock.invocationCallOrder[0],
    );
    expect(result).toMatchObject({ attemptId: RUN_ID, state: 'FAILED', error: { code: 'USER_CANCELLED' } });
  });

  it('reads no import for an account that never started one', async () => {
    const repository = makeRepository();
    const service = new ChannelCatalogCollectionService(repository, makePublisher(), channelIntegrity);

    await expect(
      service.readSource({ organizationId: ORGANIZATION_ID, channelAccountId: ACCOUNT_ID }),
    ).resolves.toEqual({ latestAttempt: null, detailsAttempt: null });
    expect(repository.findLatestRootAttempt).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      channelAccountId: ACCOUNT_ID,
    });
    expect(repository.getOwnedRunWithChunks).not.toHaveBeenCalled();
  });

  it('reads the latest root import and no details attempt before its handoff', async () => {
    const repository = makeRepository();
    repository.findLatestRootAttempt.mockResolvedValue({ id: RUN_ID });
    const service = new ChannelCatalogCollectionService(repository, makePublisher(), channelIntegrity);

    const source = await service.readSource({ organizationId: ORGANIZATION_ID, channelAccountId: ACCOUNT_ID });

    expect(source.latestAttempt).toMatchObject({ attemptId: RUN_ID, overallState: 'RUNNING' });
    expect(source.detailsAttempt).toBeNull();
    expect(repository.getOwnedRunWithChunks).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      channelAccountId: ACCOUNT_ID,
      runId: RUN_ID,
      includePayload: false,
    });
  });
});

function ownedInput() {
  return {
    organizationId: ORGANIZATION_ID,
    channelAccountId: ACCOUNT_ID,
    runId: RUN_ID,
    attemptToken: CLIENT_RUN_KEY,
  };
}

function makeRepository() {
  return {
    startOrResume: vi
      .fn<ChannelCatalogCollectionRepositoryPort['startOrResume']>()
      .mockResolvedValue(runRecord()),
    getOwnedRunWithChunks: vi
      .fn<ChannelCatalogCollectionRepositoryPort['getOwnedRunWithChunks']>()
      .mockResolvedValue(runWithChunks([])),
    getOwnedDetailsChild: vi
      .fn<ChannelCatalogCollectionRepositoryPort['getOwnedDetailsChild']>()
      .mockResolvedValue(null),
    putChunk: vi
      .fn<ChannelCatalogCollectionRepositoryPort['putChunk']>()
      .mockResolvedValue({ stored: true, chunk: {} as never }),
    markFailed: vi.fn<ChannelCatalogCollectionRepositoryPort['markFailed']>(),
    markPaused: vi.fn<ChannelCatalogCollectionRepositoryPort['markPaused']>(),
    cancel: vi.fn<ChannelCatalogCollectionRepositoryPort['cancel']>().mockResolvedValue(undefined),
    findLatestRootAttempt: vi
      .fn<ChannelCatalogCollectionRepositoryPort['findLatestRootAttempt']>()
      .mockResolvedValue(null),
  };
}

function makePublisher() {
  return {
    publish: vi.fn<ChannelCatalogPublicationPort['publish']>().mockResolvedValue({
      sourceImportRunId: '00000000-0000-4000-8000-000000000006',
      duplicate: false,
      changes: { createdProductCount: 1 },
    }),
  };
}

function runRecord() {
  const timestamp = new Date('2026-07-14T00:00:00.000Z');
  return {
    id: RUN_ID,
    collectionRunId: RUN_ID,
    attemptToken: CLIENT_RUN_KEY,
    expiresAt: new Date('2099-01-01T00:00:00Z'),
    stage: 'basics' as 'basics' | 'details',
    plan: {
      stage: 'basics' as 'basics' | 'details',
      collectorVersion: 'wing-inventory-v1',
      listUrl: 'https://wing.coupang.com/list',
      detailUrl: 'https://wing.coupang.com/detail',
      channelAccountId: ACCOUNT_ID,
      vendorId: 'V1',
      publicationRevision: '0',
    },
    organizationId: ORGANIZATION_ID,
    channelAccountId: ACCOUNT_ID,
    idempotencyKey: CLIENT_RUN_KEY,
    status: 'running',
    rowCount: 0,
    errorCount: 0,
    startedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    finishedAt: null,
    metaJson: { phase: 'discovery', collectorVersion: 'wing-inventory-v1' },
    errorJson: null,
    sourceImportRunId: null,
  };
}

function runWithChunks(
  chunks: Array<
    | ReturnType<typeof discoveryChunk>
    | ReturnType<typeof productChunk>
    | ReturnType<typeof confirmationChunk>
  >,
) {
  return { ...runRecord(), chunks };
}

function stagedReadyRun(stage: 'basics' | 'details') {
  const manifest = onePageManifest();
  const base = runRecord();
  return {
    ...base,
    stage,
    plan: {
      ...base.plan,
      stage,
      ...(stage === 'details'
        ? {
            basicAttemptId: RUN_ID,
            basicManifestHash: 'a'.repeat(64),
            basicPublicationSequence: '1',
            basicProductIds: ['P-1'],
          }
        : {}),
    },
    chunks: [
      discoveryChunk(1, [
        {
          ordinal: 0,
          externalProductId: 'P-1',
          registeredName: '상품',
          primaryImageUrl: null,
        },
      ], manifest),
      stage === 'basics' ? listingBasicsChunk() : fullDetailsChunk(),
      stage === 'basics'
        ? confirmationChunk(manifest)
        : detailConfirmationChunk(manifest),
    ],
  };
}

function listingBasicsChunk() {
  const product = productChunk(0, ['P-1']).payload.products[0]!;
  return {
    id: 'basics-0',
    kind: 'listing_basics',
    sequence: 1,
    checksum: 'b'.repeat(64),
    itemCount: 1,
    payload: {
      version: 1 as const,
      kind: 'listing_basics' as const,
      startOrdinal: 0,
      products: [product],
    },
  };
}

function fullDetailsChunk() {
  return {
    id: 'details-0',
    kind: 'full_details',
    sequence: 1,
    checksum: 'd'.repeat(64),
    itemCount: 1,
    payload: {
      version: 1 as const,
      kind: 'full_details' as const,
      startOrdinal: 0,
      products: [{
        ordinal: 0,
        product: {
          externalProductId: 'P-1',
          options: [{
            externalOptionId: 'P-1-SKU',
            vendorItemId: null,
            sellerProductItemId: 'P-1-ITEM',
            documentIds: [],
            raw: {},
          }],
          documents: [],
          media: [],
          raw: { source: 'fixture-details' },
        },
      }],
    },
  };
}

type PublishedFullDetailsChunkInput = {
  id: string;
  sequence: number;
  ordinal: number;
  externalProductId: string;
  optionCount: number;
  mediaCount: number;
  publishedAt?: Date;
};

function publishedFullDetailsChunk(input: PublishedFullDetailsChunkInput) {
  const options = Array.from({ length: input.optionCount }, (_, index) => ({
    externalOptionId: `${input.externalProductId}-SKU-${index + 1}`,
    vendorItemId: null,
    sellerProductItemId: null,
    documentIds: [],
    raw: {},
  }));
  const media = Array.from({ length: input.mediaCount }, (_, index) => ({
    sourceUrl: `https://example.com/${input.externalProductId}/detail-${index + 1}.jpg`,
    role: 'detail' as const,
    sortOrder: index,
    externalOptionId: null,
  }));
  const payload = {
    version: 1 as const,
    kind: 'full_details' as const,
    startOrdinal: input.ordinal,
    products: [{
      ordinal: input.ordinal,
      product: {
        externalProductId: input.externalProductId,
        options,
        documents: [],
        media,
        raw: {},
      },
    }],
  };

  return {
    id: input.id,
    kind: 'full_details' as const,
    sequence: input.sequence,
    checksum: 'd'.repeat(64),
    itemCount: 1,
    payload,
    ...(input.publishedAt
      ? {
          publishedAt: input.publishedAt,
          publicationJson: {
            projection: {
              kind: 'full_details',
              startOrdinal: input.ordinal,
              products: [{
                ordinal: input.ordinal,
                externalProductId: input.externalProductId,
                optionCount: input.optionCount,
                mediaCount: input.mediaCount,
              }],
            },
          },
        }
      : {}),
  };
}

function unpublishedFullDetailsChunk(
  input: Omit<PublishedFullDetailsChunkInput, 'publishedAt' | 'optionCount' | 'mediaCount'>
    & Partial<Pick<PublishedFullDetailsChunkInput, 'optionCount' | 'mediaCount'>>,
) {
  return publishedFullDetailsChunk({
    ...input,
    optionCount: input.optionCount ?? 1,
    mediaCount: input.mediaCount ?? 0,
  });
}

function detailConfirmationChunk(manifest: ReturnType<typeof onePageManifest>) {
  return {
    id: 'detail-confirmation',
    kind: 'detail_manifest_confirmation',
    sequence: 1,
    checksum: 'e'.repeat(64),
    itemCount: 1,
    payload: {
      version: 1 as const,
      kind: 'detail_manifest_confirmation' as const,
      manifest,
      basicAttemptId: RUN_ID,
      basicManifestHash: 'a'.repeat(64),
    },
  };
}

function compactChunks(chunks: Array<{ kind: string; payload?: unknown; [key: string]: unknown }>) {
  return chunks.map((chunk) => {
    const payload = chunk.payload as Record<string, unknown> | undefined;
    const projection = chunk.kind === 'discovery_page'
      ? {
          kind: chunk.kind,
          page: payload?.page,
          manifest: payload?.manifest,
          items: payload?.items,
        }
      : chunk.kind === 'manifest_confirmation' || chunk.kind === 'detail_manifest_confirmation'
        ? { kind: chunk.kind, manifest: payload?.manifest }
        : {
            kind: chunk.kind,
            startOrdinal: payload?.startOrdinal,
            products: Array.isArray(payload?.products)
              ? payload.products.map((item) => {
                  const row = item as { ordinal?: number; product?: { externalProductId?: string; options?: unknown[]; media?: unknown[] } };
                  return {
                    ordinal: row.ordinal,
                    externalProductId: row.product?.externalProductId,
                    optionCount: row.product?.options?.length ?? 0,
                    mediaCount: row.product?.media?.length ?? 0,
                  };
                })
              : [],
          };
    return {
      ...chunk,
      payload: undefined,
      publicationJson: { projection },
    };
  });
}

function onePageManifest() {
  return {
    totalItems: 1,
    pageSize: 50,
    expectedPages: 1,
    firstPageFingerprint: 'a'.repeat(64),
  };
}

function twoPageManifest() {
  return {
    totalItems: 2,
    pageSize: 1,
    expectedPages: 2,
    firstPageFingerprint: 'a'.repeat(64),
  };
}

function discoveryPayload(
  page: number,
  items: Array<{
    ordinal: number;
    externalProductId: string;
    registeredName: string | null;
    primaryImageUrl: string | null;
    saleStatus?: string | null;
  }>,
  manifest = twoPageManifest(),
) {
  return {
    version: 1 as const,
    kind: 'discovery_page' as const,
    page,
    manifest,
    items: items.map((item) => ({
      ...item,
      saleStatus: item.saleStatus ?? null,
    })),
  };
}

function discoveryChunk(
  page: number,
  items: Parameters<typeof discoveryPayload>[1],
  manifest = twoPageManifest(),
) {
  return {
    id: `discovery-${page}`,
    kind: 'discovery_page',
    sequence: page,
    checksum: 'a'.repeat(64),
    itemCount: items.length,
    payload: discoveryPayload(page, items, manifest),
  };
}

function productChunk(startOrdinal: number, productIds: string[]) {
  const products = productIds.map((externalProductId, index) => ({
    ordinal: startOrdinal + index,
    product: {
      externalProductId,
      registeredName: `${externalProductId} 등록상품`,
      displayName: `${externalProductId} 노출상품`,
      category: '완구',
      manufacturer: null,
      brand: null,
      productStatus: '승인완료',
      options: [
        {
          externalOptionId: `${externalProductId}-SKU`,
          optionName: '기본',
          skuStatus: '판매중',
          salePrice: 12_900,
          sellerSku: `${externalProductId}-SELLER`,
          modelNumber: null,
          barcode: null,
          attributes: [],
          media: [],
          raw: { source: 'fixture-option' },
        },
      ],
      media: [
        {
          sourceUrl: 'https://example.com/image.jpg',
          role: 'primary' as const,
          sortOrder: 0,
          externalOptionId: null,
        },
      ],
      raw: { source: 'fixture' },
    },
  }));
  return {
    id: `products-${startOrdinal}`,
    kind: 'listing_basics',
    sequence: startOrdinal + 1,
    checksum: 'b'.repeat(64),
    itemCount: products.length,
    payload: {
      version: 1 as const,
      kind: 'listing_basics' as const,
      startOrdinal,
      products,
    },
  };
}

function confirmationChunk(manifest = onePageManifest()) {
  return {
    id: 'confirmation',
    kind: 'manifest_confirmation',
    sequence: 1,
    checksum: 'c'.repeat(64),
    itemCount: 1,
    payload: {
      version: 1 as const,
      kind: 'manifest_confirmation' as const,
      manifest,
    },
  };
}

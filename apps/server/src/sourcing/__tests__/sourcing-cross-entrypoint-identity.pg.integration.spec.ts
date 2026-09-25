import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { canonicalOwnerInputHash } from '../../common/owner-idempotency-key';
import { createHash } from 'node:crypto';
import { isKiditemError } from '@kiditem/shared/errors';
import { sourcingExtensionOperations } from '../../test-helpers/sourcing-extension-operations';
import { SourceRecordRepositoryAdapter } from '../adapter/out/repository/source-record.repository.adapter';
import { SourcingFinalDiscoveryCapabilityAdapter } from '../adapter/in/agent/sourcing-final-discovery-capability.adapter';
import { SourceRecordDuplicateError } from '../domain/source-record-admission';
import { canonicalSourceRecordIdentity } from '../domain/source-record-identity';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';
import { realSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';

/**
 * 같은 원본이 두 입구(Agent · 확장)로 동시에 들어와도 원본 기록과 초안은 하나다(KID-313). 두 입구가
 * 같은 식별자를 만들고 같은 잠금을 잡으므로, 먼저 들어간 쪽이 입장하고 다른 쪽은 거절된다.
 */
describe('Sourcing cross-entrypoint source-record identity (PG integration)', () => {
  let agentPrisma: PrismaClient;
  let extensionPrisma: PrismaClient;

  beforeAll(async () => {
    agentPrisma = makeTestPrisma();
    extensionPrisma = makeTestPrisma();
    await Promise.all([agentPrisma.$connect(), extensionPrisma.$connect()]);
  });

  afterAll(async () => Promise.all([agentPrisma?.$disconnect(), extensionPrisma?.$disconnect()]));

  beforeEach(async () => {
    await resetDb(agentPrisma);
    await seedBaseFixture(agentPrisma);
  });

  it('lets exactly one of a concurrent Agent and extension collection of one 1688 offer in, and refuses the other', async () => {
    const sourceUrl = 'https://detail.1688.com/offer/607635921546.html';
    const sourceIdentityHash = canonicalSourceRecordIdentity({
      sourcePlatform: 'ALIBABA_1688',
      sourceUrl,
      validatedExternalOfferId: '607635921546',
      variantKeyNormalized: '',
    });
    const records = new SourceRecordRepositoryAdapter(agentPrisma as unknown as PrismaService);

    const results = await Promise.allSettled([
      records.admitOnce({
        organizationId: TEST_ORGANIZATION_ID,
        capabilityKey: 'sourcing.ingestCandidate',
        idempotencyKey: 'owner:attempt:cross-entrypoint',
        requestHash: 'a'.repeat(64),
      }, {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl,
        sourcePlatform: 'ALIBABA_1688',
        externalOfferId: '607635921546',
        variantKeyNormalized: '',
        sourceIdentityHash,
        rawData: { source: 'agent' },
        name: 'Agent source',
        description: '',
        category: null,
        tags: [],
        thumbnailUrl: null,
        imageUrl: null,
        costCny: null,
        triggeredByUserId: TEST_USER_ID,
        images: [],
      }, realSalesProductDraftPort(agentPrisma)),
      completeExtension(extensionOwner(extensionPrisma), {
        page_type: 'detail',
        source_url: sourceUrl,
        source_platform: '1688',
        product_id: '607635921546',
        title: 'Extension source',
        price_min: 12.5,
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const refused = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')!;
    expect(isDuplicateRefusal(refused.reason)).toBe(true);
    const record = await agentPrisma.sourceRecord.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, sourcePlatform: 'ALIBABA_1688', sourceIdentityHash },
      select: { id: true },
    });
    await expect(agentPrisma.sourceRecord.count()).resolves.toBe(1);
    await expect(agentPrisma.salesProduct.count({ where: { sourceRecordId: record.id } })).resolves.toBe(1);
  });

  it('gives Alibaba tracking and host spellings one identity across Agent and extension, so the later one is refused', async () => {
    const agentSourceUrl = 'https://ALIBABA.com/product-detail/kid-toy_123.html?spm=agent-feed&utm_source=agent';
    const extensionSourceUrl = 'https://www.alibaba.com/product-detail/kid-toy_123.html?spm=extension-feed&utm_source=extension';
    const canonicalSourceUrl = 'https://www.alibaba.com/product-detail/kid-toy_123.html';
    const waitForPeerRecordRead = recordReadBarrier();
    const agent = new SourcingFinalDiscoveryCapabilityAdapter(
      new SourceRecordRepositoryAdapter(prismaWithRecordReadBarrier(agentPrisma, waitForPeerRecordRead) as unknown as PrismaService),
      {
        scrapeProductUrl: async () => ({
          ok: true,
          source_url: agentSourceUrl,
          scraped_data: { title: 'Agent Alibaba source', variant_key: '  Blue   Set ', images: [] },
        }),
      } as never,
      realSalesProductDraftPort(agentPrisma),
    );
    const extension = extensionOwner(prismaWithRecordReadBarrier(extensionPrisma, waitForPeerRecordRead));
    const snapshot = await agent.scrapeProductUrl({ sourceUrl: agentSourceUrl });
    const requestHash = canonicalOwnerInputHash({ snapshot });

    const results = await Promise.allSettled([
      agent.ingestCandidate({
        organizationId: TEST_ORGANIZATION_ID,
        initiatingUserId: TEST_USER_ID,
        idempotencyKey: 'owner:attempt:cross-entrypoint-alibaba',
        requestHash,
        snapshot,
      }),
      completeExtension(extension, {
        page_type: 'detail',
        source_url: extensionSourceUrl,
        source_platform: 'alibaba',
        product_id: 'supplier-product-id-123',
        variant_key: 'blue set',
        title: 'Extension Alibaba source',
        images: ['https://www.alibaba.com/images/kid-toy.jpg'],
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(isDuplicateRefusal((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason)).toBe(true);
    const record = await agentPrisma.sourceRecord.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, sourceUrl: canonicalSourceUrl },
      select: { id: true },
    });
    await expect(agentPrisma.sourceRecord.count()).resolves.toBe(1);
    await expect(agentPrisma.salesProduct.count({ where: { sourceRecordId: record.id } })).resolves.toBe(1);
  });
});

function extensionOwner(prisma: PrismaClient) {
  return sourcingExtensionOperations(prisma, realSalesProductDraftPort(prisma)).operations;
}

/** 확장 상품 수집 실행(KID-360): begin → 상품 문서 청크 → finish. finish가 거절되면 그 오류를 던진다. */
async function completeExtension(
  operations: ReturnType<typeof extensionOwner>,
  product: Record<string, unknown> & { source_url: string; source_platform: string },
) {
  const begun = await operations.begin(TEST_ORGANIZATION_ID, {
    kind: 'sourcing.product_extension',
    scope: { platform: product.source_platform, url: product.source_url },
  }, { userId: TEST_USER_ID });
  const payload = [{ product, hadDescription: false }];
  await operations.putChunk({ organizationId: TEST_ORGANIZATION_ID, operationId: begun.operation.id, token: begun.token,
    chunkKind: 'product_document', sequence: 1,
    request: { checksum: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), payload } });
  return operations.finish({ organizationId: TEST_ORGANIZATION_ID, operationId: begun.operation.id, token: begun.token,
    request: { outcome: 'succeeded' } });
}

/** 같은 원본의 두 번째 입장 거절: Agent 입구는 도메인 오류, 확장 실행은 그 409 봉투 오류로 온다. */
function isDuplicateRefusal(reason: unknown): boolean {
  return reason instanceof SourceRecordDuplicateError
    || (isKiditemError(reason) && reason.code === 'SOURCING_DUPLICATE_RECORD');
}

/**
 * Forces the pre-fix cross-entrypoint read/create window. Once both writers
 * share the canonical advisory key, the bounded wait lets the first commit
 * before the second reaches its lookup instead of deadlocking the test.
 */
function recordReadBarrier(): () => Promise<void> {
  let reads = 0;
  let releasePeer: () => void = () => undefined;
  const peerRead = new Promise<void>((resolve) => {
    releasePeer = resolve;
  });
  return async () => {
    reads += 1;
    if (reads >= 2) {
      releasePeer();
      return;
    }
    await Promise.race([
      peerRead,
      new Promise<void>((resolve) => setTimeout(resolve, 100)),
    ]);
  };
}

function prismaWithRecordReadBarrier(
  prisma: PrismaClient,
  waitForPeerRecordRead: () => Promise<void>,
): PrismaClient {
  return new Proxy(prisma, {
    get(target, property, receiver) {
      if (property !== '$transaction') return Reflect.get(target, property, receiver);
      return async <T>(
        operation: (transaction: object) => Promise<T>,
        options?: unknown,
      ): Promise<T> => target.$transaction(
        (transaction) => operation(withRecordReadBarrier(transaction, waitForPeerRecordRead)),
        options as never,
      );
    },
  }) as PrismaClient;
}

function withRecordReadBarrier(
  transaction: object,
  waitForPeerRecordRead: () => Promise<void>,
): object {
  return new Proxy(transaction, {
    get(target, property, receiver) {
      if (property !== 'sourceRecord') return Reflect.get(target, property, receiver);
      const candidate = Reflect.get(target, property, receiver) as object;
      return new Proxy(candidate, {
        get(candidateTarget, candidateProperty, candidateReceiver) {
          const member = Reflect.get(candidateTarget, candidateProperty, candidateReceiver);
          if (candidateProperty !== 'findFirst' || typeof member !== 'function') return member;
          return async (...args: unknown[]) => {
            const result = await member.apply(candidateTarget, args);
            await waitForPeerRecordRead();
            return result;
          };
        },
      });
    },
  });
}

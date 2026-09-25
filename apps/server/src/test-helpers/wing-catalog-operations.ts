import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  WING_CATALOG_CHUNK_KINDS,
  WING_CATALOG_DETAILS_KIND,
  WING_CATALOG_LIST_KIND,
  type CoupangCatalogBasicProductV1,
  type CoupangCatalogDetailProductV1,
  type WingCatalogDeletionConfirmationItem,
} from '@kiditem/shared/coupang-catalog-snapshot';
import type { OperationView } from '@kiditem/shared/operation';
import type { PrismaService } from '../prisma/prisma.service';
import { OperationRepositoryAdapter } from '../common/operation/adapter/out/repository/operation.repository.adapter';
import { OperationOwnerRegistry } from '../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../common/operation/application/service/operation.service';
import { AiCatalogMediaPublicationRepositoryAdapter } from '../content/adapter/out/repository/ai-catalog-media-publication.repository.adapter';
import { ChannelIntegrityAdapter } from '../channels/adapter/out/integrity/channel-integrity.adapter';
import { ChannelsDocumentsAdapter } from '../channels/adapter/out/documents/channel-documents.adapter';
import type { ChannelDocumentsPort } from '../channels/application/port/out/documents/channel-documents.port';
import { ChannelsProductMappingGenerationAdapter } from '../channels/adapter/out/products/product-mapping-generation.adapter';
import { ChannelCatalogPublicationRepositoryAdapter } from '../channels/adapter/out/repository/channel-catalog-publication.repository.adapter';
import { WingCatalogOperationService } from '../channels/application/service/collection/wing-catalog-operation.service';
import {
  WingCatalogDetailsOperationOwner,
  WingCatalogExcelOperationOwner,
  WingCatalogListOperationOwner,
} from '../channels/adapter/in/operation/wing-catalog-operation-owners';
import { ProductMappingGenerationRepositoryAdapter } from '../products/adapter/out/persistence/product-mapping-generation.repository.adapter';
import { makeChannelListingQuery, makeChannelRecipes } from './channel-catalog-ports';
import { TEST_ORGANIZATION_ID, TEST_USER_ID } from './real-prisma';

const checksum = (payload: unknown[]) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

/**
 * Wing 카탈로그 kind 셋을 실제 실행 계약(OperationService + PG)과 실제 Channels·Content 어댑터로 돌린다.
 * 확장이 하는 일(begin → 청크 → finish)을 서버 포트로 그대로 밟는다 — 가짜는 없다.
 */
export function makeWingCatalogOperations(
  prisma: PrismaClient,
  options: { organizationId?: string; documents?: ChannelDocumentsPort } = {},
) {
  const organizationId = options.organizationId ?? TEST_ORGANIZATION_ID;
  const prismaService = prisma as unknown as PrismaService;
  const registry = new OperationOwnerRegistry(null as never, null as never);
  const operations = new OperationService(new OperationRepositoryAdapter(prismaService), registry);
  const publication = new ChannelCatalogPublicationRepositoryAdapter(
    prismaService,
    new AiCatalogMediaPublicationRepositoryAdapter(makeChannelListingQuery(prisma)),
    makeChannelRecipes(prisma),
    new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
  );
  const catalog = new WingCatalogOperationService(publication, options.documents ?? new ChannelsDocumentsAdapter(), operations, new ChannelIntegrityAdapter());
  registry.register(new WingCatalogListOperationOwner(catalog));
  registry.register(new WingCatalogDetailsOperationOwner(catalog));
  registry.register(new WingCatalogExcelOperationOwner(catalog));

  async function run(
    kind: string,
    scope: Record<string, unknown>,
    chunks: Array<{ chunkKind: string; items: unknown[] }>,
    options: { perChunk?: number; outcome?: 'succeeded' | 'failed'; userId?: string | null } = {},
  ): Promise<OperationView> {
    const begun = await operations.begin(organizationId, { kind, scope }, { userId: options.userId === undefined ? TEST_USER_ID : options.userId });
    const per = options.perChunk ?? 20;
    const sequences = new Map<string, number>();
    for (const { chunkKind, items } of chunks) {
      for (let offset = 0; offset < items.length; offset += per) {
        const payload = items.slice(offset, offset + per);
        const sequence = (sequences.get(chunkKind) ?? 0) + 1;
        sequences.set(chunkKind, sequence);
        await operations.putChunk({
          organizationId,
          operationId: begun.operation.id,
          token: begun.token,
          chunkKind,
          sequence,
          request: { checksum: checksum(payload), payload },
        });
      }
    }
    const outcome = options.outcome ?? 'succeeded';
    const finished = await operations.finish({
      organizationId,
      operationId: begun.operation.id,
      token: begun.token,
      request: outcome === 'failed' ? { outcome, errorCode: 'RUNTIME_COLLECT_FAILED' } : { outcome },
    });
    return finished.operation;
  }

  return {
    operations,
    catalog,
    run,
    /** 목록 kind: 목록 전체를 `listing_basics`로 보내고 finish. result에 상세 계획과 `next`가 있다. */
    runList(channelAccountId: string, products: CoupangCatalogBasicProductV1[], options: { userId?: string | null } = {}) {
      return run(WING_CATALOG_LIST_KIND, { channelAccountId }, [
        { chunkKind: WING_CATALOG_CHUNK_KINDS.listingBasics, items: products },
      ], options);
    },
    /** 상세 kind: scope 그대로 begin, 상세·삭제 확인 청크를 보내고 finish(또는 failed). */
    runDetails(
      scope: { channelAccountId: string; detailTargetProductIds: string[]; absentProductIds: string[]; via?: 'list' | 'manual' },
      details: CoupangCatalogDetailProductV1[],
      confirmations: WingCatalogDeletionConfirmationItem[] = [],
      options: { outcome?: 'succeeded' | 'failed' } = {},
    ) {
      return run(WING_CATALOG_DETAILS_KIND, scope, [
        { chunkKind: WING_CATALOG_CHUNK_KINDS.fullDetails, items: details },
        { chunkKind: WING_CATALOG_CHUNK_KINDS.deletionConfirmation, items: confirmations },
      ], options);
    },
    uploadWorkbook(channelAccountId: string, bytes: Uint8Array, observedAt?: string, asOrganization = organizationId) {
      return catalog.uploadWorkbook({
        organizationId: asOrganization,
        userId: TEST_USER_ID,
        channelAccountId,
        bytes,
        ...(observedAt ? { observedAt } : {}),
      });
    },
  };
}

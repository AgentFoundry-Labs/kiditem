import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { OperationBeginResponse, OperationView } from '@kiditem/shared/operation';
import type { PrismaService } from '../prisma/prisma.service';
import { OperationRepositoryAdapter } from '../common/operation/adapter/out/repository/operation.repository.adapter';
import { OperationOwnerRegistry } from '../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../common/operation/application/service/operation.service';
import { ChannelIntegrityAdapter } from '../channels/adapter/out/integrity/channel-integrity.adapter';
import { ChannelsDocumentsAdapter } from '../channels/adapter/out/documents/channel-documents.adapter';
import { RocketSellpiaMatchingCsvImportRepositoryAdapter } from '../channels/adapter/out/repository/rocket-sellpia-matching-csv-import.repository.adapter';
import { RocketSellpiaMatchingCsvImportService } from '../channels/application/service/collection/rocket-sellpia-matching-csv-import.service';
import { RocketMatchingCsvOperationOwner } from '../channels/adapter/in/operation/rocket-matching-csv-operation-owner';
import { ChannelsProductMappingGenerationAdapter } from '../channels/adapter/out/products/product-mapping-generation.adapter';
import { ProductMappingGenerationRepositoryAdapter } from '../products/adapter/out/persistence/product-mapping-generation.repository.adapter';
import { SabangnetMallListingsRepositoryAdapter } from '../channels/adapter/out/repository/sabangnet-mall-listings.repository.adapter';
import { SabangnetMallListingsService } from '../channels/application/service/collection/sabangnet-mall-listings.service';
import { SabangnetMallListingsOperationOwner } from '../channels/adapter/in/operation/sabangnet-mall-listings-operation-owner';
import { ProductTransactionalReadRepositoryAdapter } from '../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { SellpiaManualMatchRepositoryAdapter } from '../channels/adapter/out/repository/sellpia-manual-match.repository.adapter';
import { SellpiaManualMatchService } from '../channels/application/service/listing/sellpia-manual-match.service';
import { SellpiaManualMatchOperationOwner } from '../channels/adapter/in/operation/sellpia-manual-match-operation-owner';
import { MallAdminListingsRepositoryAdapter } from '../channels/adapter/out/repository/mall-admin-listings.repository.adapter';
import { MallAdminListingsService } from '../channels/application/service/collection/mall-admin-listings.service';
import { MallAdminListingsOperationOwner } from '../channels/adapter/in/operation/mall-admin-listings-operation-owner';
import { TEST_ORGANIZATION_ID, TEST_USER_ID } from './real-prisma';

const checksum = (payload: unknown[]) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');
type Chunks = Array<{ chunkKind: string; items: unknown[] }>;

/**
 * Channels "기타" 실행 kind(KID-363)를 실제 실행 계약(OperationService + PG)과 실제 Channels 어댑터로 돌린다.
 * 가짜는 없다 — 확장·웹이 하는 일(begin → 청크 → finish)을 서버 포트로 그대로 밟는다.
 */
export function makeChannelsOperations(prisma: PrismaClient, options: { organizationId?: string } = {}) {
  const organizationId = options.organizationId ?? TEST_ORGANIZATION_ID;
  const prismaService = prisma as unknown as PrismaService;
  const registry = new OperationOwnerRegistry(null as never, null as never);
  const operations = new OperationService(new OperationRepositoryAdapter(prismaService), registry);
  const rocketCsv = new RocketSellpiaMatchingCsvImportService(
    operations,
    new ChannelsDocumentsAdapter(),
    new ChannelIntegrityAdapter(),
    new RocketSellpiaMatchingCsvImportRepositoryAdapter(prismaService),
  );
  registry.register(new RocketMatchingCsvOperationOwner(rocketCsv));
  const productMapping = new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter());
  const sabangnet = new SabangnetMallListingsService(
    operations,
    new SabangnetMallListingsRepositoryAdapter(prismaService, productMapping),
  );
  registry.register(new SabangnetMallListingsOperationOwner(sabangnet));
  const manualMatch = new SellpiaManualMatchService(
    operations,
    new SellpiaManualMatchRepositoryAdapter(prismaService, new ProductTransactionalReadRepositoryAdapter()),
  );
  registry.register(new SellpiaManualMatchOperationOwner(manualMatch));
  const mallAdminRepository = new MallAdminListingsRepositoryAdapter(prismaService, productMapping);
  const mallAdmin = new MallAdminListingsService(mallAdminRepository, mallAdminRepository, operations);
  registry.register(new MallAdminListingsOperationOwner(mallAdmin));

  /** 확장이 하는 일: begin한 실행에 plan을 보고 청크를 보내고 finish(또는 failed). */
  async function runBegun(
    begun: OperationBeginResponse,
    chunks: (plan: Record<string, unknown>) => Chunks,
    options: { perChunk?: number; outcome?: 'succeeded' | 'failed' } = {},
  ): Promise<OperationView> {
    const per = options.perChunk ?? 50;
    const sequences = new Map<string, number>();
    for (const { chunkKind, items } of chunks(begun.operation.plan ?? {})) {
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
    rocketCsv,
    sabangnet,
    manualMatch,
    mallAdmin,
    runBegun,
    /** runner가 finalize 거절 뒤 하는 일: finish(failed)로 닫아 잠금을 푼다. */
    async fail(begun: OperationBeginResponse) {
      return (await operations.finish({
        organizationId,
        operationId: begun.operation.id,
        token: begun.token,
        request: { outcome: 'failed', errorCode: 'SOURCE_SNAPSHOT_INVALID' },
      })).operation;
    },
    uploadRocketCsv(channelAccountId: string, bytes: Uint8Array, fileName = 'rocket-matching.csv') {
      return rocketCsv.importMatchingCsv({ organizationId, userId: TEST_USER_ID, channelAccountId, fileName, bytes });
    },
  };
}

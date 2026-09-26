import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { OperationRepositoryAdapter } from '../common/operation/adapter/out/repository/operation.repository.adapter';
import { OperationOwnerRegistry } from '../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../common/operation/application/service/operation.service';
import { ChannelIntegrityAdapter } from '../channels/adapter/out/integrity/channel-integrity.adapter';
import { ChannelsDocumentsAdapter } from '../channels/adapter/out/documents/channel-documents.adapter';
import { RocketSellpiaMatchingCsvImportRepositoryAdapter } from '../channels/adapter/out/repository/rocket-sellpia-matching-csv-import.repository.adapter';
import { RocketSellpiaMatchingCsvImportService } from '../channels/application/service/collection/rocket-sellpia-matching-csv-import.service';
import { RocketMatchingCsvOperationOwner } from '../channels/adapter/in/operation/rocket-matching-csv-operation-owner';
import { TEST_ORGANIZATION_ID, TEST_USER_ID } from './real-prisma';

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

  return {
    operations,
    rocketCsv,
    uploadRocketCsv(channelAccountId: string, bytes: Uint8Array, fileName = 'rocket-matching.csv') {
      return rocketCsv.importMatchingCsv({ organizationId, userId: TEST_USER_ID, channelAccountId, fileName, bytes });
    },
  };
}

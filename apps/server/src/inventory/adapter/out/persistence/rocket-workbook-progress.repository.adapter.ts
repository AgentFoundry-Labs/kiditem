import { InventoryImportConflictError } from '../../../application/exception/inventory-operation.error';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { RocketWorkbookProgressRepositoryPort } from '../../../application/port/out/persistence/rocket-workbook-progress.repository.port';
import {
  SELLPIA_TRANSFER_OUTCOME_PORT,
  type SellpiaTransferOutcomePort,
} from '../../../../orders/application/port/in/capability/sellpia-transfer-outcome.port';

@Injectable()
export class RocketWorkbookProgressRepositoryAdapter
implements RocketWorkbookProgressRepositoryPort {
  constructor(
    @Inject(SELLPIA_TRANSFER_OUTCOME_PORT)
    private readonly transferOutcomes: SellpiaTransferOutcomePort,
  ) {}

  async read(
    input: Parameters<RocketWorkbookProgressRepositoryPort['read']>[0],
  ) {
    const tx = transactionClient(input.transaction);
    const state = await tx.sellpiaInventoryState.findUnique({
      where: { organizationId: input.organizationId },
      select: { verifiedGeneration: true },
    });
    if (!state) {
      throw new InventoryImportConflictError('Sellpia inventory state was not found.');
    }
    const outcomes = await this.transferOutcomes.readLatestOutcomes({
      organizationId: input.organizationId,
      sources: input.transmissionSources,
      transaction: tx,
    });
    return {
      verifiedGeneration: state.verifiedGeneration,
      transferStatuses: outcomes.map(({ status }) => status),
    };
  }
}

function transactionClient(value: unknown): Prisma.TransactionClient {
  if (
    typeof value !== 'object'
    || value === null
    || !('sellpiaInventoryState' in value)
    || !('$queryRaw' in value)
  ) {
    throw new TypeError('A Prisma transaction client is required');
  }
  return value as Prisma.TransactionClient;
}

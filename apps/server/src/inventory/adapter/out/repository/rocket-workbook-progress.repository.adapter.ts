import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { RocketWorkbookProgressRepositoryPort } from '../../../application/port/out/repository/rocket-workbook-progress.repository.port';
import type { RocketWorkbookTransmissionIntentRecord } from '../../../application/port/out/repository/rocket-workbook-progress.repository.port';

@Injectable()
export class RocketWorkbookProgressRepositoryAdapter
implements RocketWorkbookProgressRepositoryPort {
  async read(
    input: Parameters<RocketWorkbookProgressRepositoryPort['read']>[0],
  ) {
    const tx = transactionClient(input.transaction);
    const state = await tx.sellpiaInventoryState.findUnique({
      where: { organizationId: input.organizationId },
      select: { verifiedGeneration: true },
    });
    if (!state) {
      throw new ConflictException('Sellpia inventory state was not found.');
    }
    const rows = input.intentKeys.length === 0 ? [] : await tx.sellpiaOrderTransmissionIntent.findMany({
      where: {
        organizationId: input.organizationId,
        intentKey: { in: input.intentKeys },
      },
      select: { intentKey: true, status: true, finalizedGeneration: true },
      orderBy: { intentKey: 'asc' },
    });
    return {
      verifiedGeneration: state.verifiedGeneration,
      intents: rows.map((row) => {
        const status = row.status;
        if (
          status !== 'prepared'
          && status !== 'finalized'
          && status !== 'aborted'
        ) {
          throw new ConflictException('Sellpia order transmission intent has an invalid status.');
        }
        return {
          intentKey: row.intentKey,
          status: status as RocketWorkbookTransmissionIntentRecord['status'],
          finalizedGeneration: row.finalizedGeneration,
        };
      }),
    };
  }
}

function transactionClient(value: unknown): Prisma.TransactionClient {
  if (
    typeof value !== 'object'
    || value === null
    || !('sellpiaInventoryState' in value)
    || !('sellpiaOrderTransmissionIntent' in value)
  ) {
    throw new TypeError('A Prisma transaction client is required');
  }
  return value as Prisma.TransactionClient;
}

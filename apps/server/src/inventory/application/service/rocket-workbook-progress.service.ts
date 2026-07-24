import { Inject, Injectable } from '@nestjs/common';
import type { RocketWorkbookWorkflowStatus } from '@kiditem/shared/rocket-purchase-preview';
import type { RocketWorkbookProgressPort } from '../port/in/stock/rocket-workbook-progress.port';
import {
  ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT,
  type RocketWorkbookProgressRepositoryPort,
} from '../port/out/repository/rocket-workbook-progress.repository.port';

@Injectable()
export class RocketWorkbookProgressService implements RocketWorkbookProgressPort {
  constructor(
    @Inject(ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT)
    private readonly repository: RocketWorkbookProgressRepositoryPort,
  ) {}

  async read(
    input: Parameters<RocketWorkbookProgressPort['read']>[0],
  ): Promise<{
    status: RocketWorkbookWorkflowStatus;
    verifiedGeneration: bigint;
  }> {
    if (!input.allPositiveLinesCollected) {
      return {
        status: 'awaiting_coupang_confirmation',
        verifiedGeneration: input.exportGeneration ?? 0n,
      };
    }

    const snapshot = await this.repository.read({
      transaction: input.transaction,
      organizationId: input.organizationId,
      intentKeys: input.intentKeys,
    });
    if (input.intentKeys.length === 0 || snapshot.intents.length !== input.intentKeys.length) {
      return {
        status: 'orders_collected',
        verifiedGeneration: snapshot.verifiedGeneration,
      };
    }
    if (snapshot.intents.some(({ status }) => status === 'aborted')) {
      return { status: 'failed', verifiedGeneration: snapshot.verifiedGeneration };
    }
    if (snapshot.intents.some(({ status }) => status === 'prepared')) {
      return {
        status: 'sellpia_transmitting',
        verifiedGeneration: snapshot.verifiedGeneration,
      };
    }
    const finalizedGenerations = snapshot.intents.map(
      ({ finalizedGeneration }) => finalizedGeneration,
    );
    if (
      input.exportGeneration === null
      || finalizedGenerations.some((generation) => generation === null)
    ) {
      return { status: 'failed', verifiedGeneration: snapshot.verifiedGeneration };
    }
    const lastFinalizedGeneration = finalizedGenerations.reduce<bigint>(
      (latest, generation) => generation! > latest ? generation! : latest,
      0n,
    );
    if (
      snapshot.verifiedGeneration > input.exportGeneration
      && snapshot.verifiedGeneration >= lastFinalizedGeneration
    ) {
      return { status: 'completed', verifiedGeneration: snapshot.verifiedGeneration };
    }
    return {
      status: 'awaiting_inventory_sync',
      verifiedGeneration: snapshot.verifiedGeneration,
    };
  }
}

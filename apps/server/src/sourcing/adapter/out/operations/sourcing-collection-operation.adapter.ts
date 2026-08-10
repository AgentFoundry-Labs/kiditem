import { Inject, Injectable } from '@nestjs/common';
import {
  OPERATION_RUNNER_PORT,
  type OperationRunnerPort,
} from '../../../../operations/application/port/in/operation-runner.port';
import type { SourcingCollectionOperationPort } from '../../../application/port/out/cross-domain/sourcing-collection-operation.port';

@Injectable()
export class SourcingCollectionOperationAdapter
  implements SourcingCollectionOperationPort
{
  constructor(
    @Inject(OPERATION_RUNNER_PORT)
    private readonly runner: OperationRunnerPort,
  ) {}

  async startCollection(input: {
    organizationId: string;
    requestedByUserId: string | null;
    sources: Array<'naver' | '1688' | 'shorts'>;
    idempotencyKey: string;
  }): Promise<{ operationRunId: string; status: string }> {
    const run = await this.runner.start({
      organizationId: input.organizationId,
      operationKey: 'sourcing.collect_daily_trends',
      triggerSource: 'agent',
      input: input.sources.length > 0 ? { sources: input.sources } : {},
      requestedByUserId: input.requestedByUserId,
      idempotencyKey: input.idempotencyKey,
    });
    return { operationRunId: run.id, status: run.status };
  }
}

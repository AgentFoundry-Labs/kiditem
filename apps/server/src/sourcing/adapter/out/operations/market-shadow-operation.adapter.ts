import { Inject, Injectable } from '@nestjs/common';
import {
  OPERATION_RUNNER_PORT,
  type OperationRunnerPort,
} from '../../../../operations/application/port/in/operation-runner.port';
import type { MarketShadowOperationPort } from '../../../application/port/out/cross-domain/market-shadow-operation.port';

@Injectable()
export class MarketShadowOperationAdapter implements MarketShadowOperationPort {
  constructor(
    @Inject(OPERATION_RUNNER_PORT)
    private readonly runner: OperationRunnerPort,
  ) {}

  async startShadowCollection(input: {
    organizationId: string;
    requestedByUserId: string | null;
    triggerSource: 'domain_screen' | 'agent';
    idempotencyKey?: string | null;
  }): Promise<{ operationRunId: string; status: string }> {
    const run = await this.runner.start({
      organizationId: input.organizationId,
      operationKey: 'sourcing.collect_shadow_signals',
      triggerSource: input.triggerSource,
      input: {},
      requestedByUserId: input.requestedByUserId,
      idempotencyKey: input.idempotencyKey?.trim() || null,
    });
    return { operationRunId: run.id, status: run.status };
  }
}

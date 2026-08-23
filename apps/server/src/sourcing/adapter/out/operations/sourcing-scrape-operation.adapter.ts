import { Inject, Injectable } from '@nestjs/common';
import {
  OPERATION_RUNNER_PORT,
  type OperationRunnerPort,
} from '../../../../operations/application/port/in/operation-runner.port';
import type { SourcingScrapeOperationPort } from '../../../application/port/out/cross-domain/sourcing-scrape-operation.port';
import { SOURCING_SCRAPE_URL_OPERATION } from '../../../domain/operation/sourcing.operations';

@Injectable()
export class SourcingScrapeOperationAdapter implements SourcingScrapeOperationPort {
  constructor(
    @Inject(OPERATION_RUNNER_PORT) private readonly operations: OperationRunnerPort,
  ) {}

  async startDirect(input: {
    organizationId: string;
    requestedByUserId: string | null;
    sourceUrl: string;
    idempotencyKey: string;
  }): Promise<{ operationRunId: string; status: string }> {
    const run = await this.operations.start({
      organizationId: input.organizationId,
      operationKey: SOURCING_SCRAPE_URL_OPERATION.key,
      triggerSource: 'domain_screen',
      input: { sourceUrl: input.sourceUrl },
      requestedByUserId: input.requestedByUserId,
      idempotencyKey: input.idempotencyKey,
    });
    return { operationRunId: run.id, status: run.status };
  }

}

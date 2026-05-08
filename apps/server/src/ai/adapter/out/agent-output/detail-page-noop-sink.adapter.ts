import { Injectable, Logger } from '@nestjs/common';
import type { DetailPageAgentOutputSinkPort } from '../../../application/port/out/detail-page-agent-output-sink.port';

/**
 * Phase 1 default — does NOT write to `ContentGeneration`. Only logs that the
 * bridge handed over a validated output. Phase 2 PR replaces this binding with
 * an adapter that updates the `ContentGeneration` row keyed on
 * `sourceResourceId` (READY on success, FAILED on error).
 *
 * Keeping the no-op adapter explicit (rather than a silent default in the
 * bridge) means:
 *   - The wiring in `AiModule` shows the contract is intentionally inert.
 *   - Phase 2 swap is a one-line `useClass` change, no bridge churn.
 *   - Tests can verify the sink call shape without a real DB writer.
 */
@Injectable()
export class DetailPageNoopAgentOutputSink
  implements DetailPageAgentOutputSinkPort
{
  private readonly logger = new Logger(DetailPageNoopAgentOutputSink.name);

  async applySuccess(input: {
    organizationId: string;
    requestId: string;
    runId: string | undefined;
    sourceResourceId: string | null;
    output: unknown;
  }): Promise<void> {
    this.logger.log(
      `detail_page_generate success accepted (request=${input.requestId} run=${input.runId ?? 'n/a'} resource=${input.sourceResourceId ?? 'n/a'}) — no-op sink, ContentGeneration not updated.`,
    );
  }

  async applyFailure(input: {
    organizationId: string;
    requestId: string;
    runId: string | undefined;
    sourceResourceId: string | null;
    errorCode: string;
    errorMessage: string;
  }): Promise<void> {
    this.logger.warn(
      `detail_page_generate failure accepted (request=${input.requestId} run=${input.runId ?? 'n/a'} resource=${input.sourceResourceId ?? 'n/a'}, code=${input.errorCode}) — no-op sink, ContentGeneration not updated. message=${input.errorMessage}`,
    );
  }
}

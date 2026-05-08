import { Injectable, Logger } from '@nestjs/common';
import type { ThumbnailAgentOutputSinkPort } from '../../../application/port/out/thumbnail-agent-output-sink.port';

/**
 * Phase 1 default — does NOT write to `ThumbnailGeneration`. Only logs that
 * the bridge handed over a validated output. Phase 2 PR replaces this binding
 * with an adapter that updates the `ThumbnailGeneration` row + writes the
 * candidate rows + emits a `ThumbnailGenerationEvent` on success / failure.
 *
 * Keeping the no-op adapter explicit (rather than a silent default in the
 * bridge) means:
 *   - The wiring in `AiModule` shows the contract is intentionally inert.
 *   - Phase 2 swap is a one-line `useClass` change, no bridge churn.
 *   - Tests can verify the sink call shape without a real DB writer.
 */
@Injectable()
export class ThumbnailNoopAgentOutputSink
  implements ThumbnailAgentOutputSinkPort
{
  private readonly logger = new Logger(ThumbnailNoopAgentOutputSink.name);

  async applySuccess(input: {
    organizationId: string;
    requestId: string;
    runId: string | undefined;
    sourceResourceId: string | null;
    output: { candidates: { url: string }[] };
  }): Promise<void> {
    this.logger.log(
      `thumbnail_generate success accepted (request=${input.requestId} run=${input.runId ?? 'n/a'} resource=${input.sourceResourceId ?? 'n/a'} candidates=${input.output.candidates.length}) — no-op sink, ThumbnailGeneration not updated.`,
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
      `thumbnail_generate failure accepted (request=${input.requestId} run=${input.runId ?? 'n/a'} resource=${input.sourceResourceId ?? 'n/a'}, code=${input.errorCode}) — no-op sink, ThumbnailGeneration not updated. message=${input.errorMessage}`,
    );
  }
}

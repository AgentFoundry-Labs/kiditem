import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AGENT_RUN_EVENTS,
  type AgentRunFinalizedEvent,
} from '../../../agent-os/application/event/agent-run-events';
import {
  IMAGE_EDIT_AGENT_TYPE,
  ImageEditAgentOutputSchema,
} from '../../domain/agent-output';
import {
  IMAGE_EDIT_AGENT_OUTPUT_SINK_PORT,
  type ImageEditAgentOutputSinkPort,
} from '../port/out/sink/image-edit-agent-output-sink.port';

@Injectable()
export class ImageEditAgentOutputBridge {
  private readonly logger = new Logger(ImageEditAgentOutputBridge.name);

  constructor(
    @Inject(IMAGE_EDIT_AGENT_OUTPUT_SINK_PORT)
    private readonly sink: ImageEditAgentOutputSinkPort,
  ) {}

  @OnEvent(AGENT_RUN_EVENTS.FINALIZED)
  async onAgentRunFinalized(event: AgentRunFinalizedEvent): Promise<void> {
    if (event.agentType !== IMAGE_EDIT_AGENT_TYPE) return;
    try {
      if (event.status === 'failed') {
        await this.sink.applyFailure({
          organizationId: event.organizationId,
          requestId: event.requestId,
          runId: event.runId,
          sourceResourceId: event.sourceResourceId,
          errorCode: event.errorCode ?? 'agent_run_failed',
          errorMessage: event.errorMessage ?? 'Agent run failed without a message.',
        });
        return;
      }

      const parsed = ImageEditAgentOutputSchema.safeParse(event.output);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const errorMessage = issue
          ? `${issue.path.join('.') || '<root>'}: ${issue.message}`
          : 'Output failed schema validation.';
        this.logger.warn(
          `image_edit output rejected (request=${event.requestId}): ${errorMessage}`,
        );
        await this.sink.applyFailure({
          organizationId: event.organizationId,
          requestId: event.requestId,
          runId: event.runId,
          sourceResourceId: event.sourceResourceId,
          errorCode: 'agent_output_invalid',
          errorMessage,
        });
        return;
      }

      await this.sink.applySuccess({
        organizationId: event.organizationId,
        requestId: event.requestId,
        runId: event.runId,
        sourceResourceId: event.sourceResourceId,
        output: parsed.data,
      });
    } catch (err) {
      this.logger.warn(
        `image_edit bridge failed for request=${event.requestId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AGENT_RUN_EVENTS,
  type AgentRunFinalizedEvent,
} from '../../../agent-os/application/event/agent-run-events';
import {
  AI_AGENT_SOURCE_TYPES,
  THUMBNAIL_GENERATE_AGENT_TYPE,
  ThumbnailGenerateAgentOutputSchema,
} from '../../domain/agent-output';
import {
  THUMBNAIL_AGENT_OUTPUT_SINK_PORT,
  type ThumbnailAgentOutputSinkPort,
} from '../port/out/thumbnail-agent-output-sink.port';

/**
 * AI domain bridge — listens for `agent.run.finalized` events and routes
 * `thumbnail_generate` results back into the AI domain through the sink port.
 *
 * Same contract as `DetailPageAgentOutputBridge`:
 *   - Filters strictly on `event.agentType` (the executor stamps the resolved
 *     Agent OS type into the bus payload). No envelope sniffing — failure
 *     events have no `output`, so envelope-based filtering would silently
 *     drop real runtime failures of agents we own.
 *   - Validates output against Zod schema owned by the AI domain.
 *   - Delegates to a sink port (Phase 1 = no-op, Phase 2 = real
 *     `ThumbnailGeneration` writer).
 *   - Never writes to the DB directly; the runtime side is forbidden from
 *     touching Prisma per agent-os/AGENTS.md.
 */
@Injectable()
export class ThumbnailAgentOutputBridge {
  private readonly logger = new Logger(ThumbnailAgentOutputBridge.name);

  constructor(
    @Inject(THUMBNAIL_AGENT_OUTPUT_SINK_PORT)
    private readonly sink: ThumbnailAgentOutputSinkPort,
  ) {}

  static readonly AGENT_TYPE = THUMBNAIL_GENERATE_AGENT_TYPE;
  static readonly SOURCE_TYPE = AI_AGENT_SOURCE_TYPES.THUMBNAIL_GENERATE;

  @OnEvent(AGENT_RUN_EVENTS.FINALIZED)
  async onAgentRunFinalized(event: AgentRunFinalizedEvent): Promise<void> {
    if (event.agentType !== ThumbnailAgentOutputBridge.AGENT_TYPE) return;
    if (event.requestStatus === 'cancelled') return;
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

      const parsed = ThumbnailGenerateAgentOutputSchema.safeParse(event.output);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const errorMessage = issue
          ? `${issue.path.join('.') || '<root>'}: ${issue.message}`
          : 'Output failed schema validation.';
        this.logger.warn(
          `thumbnail_generate output rejected (request=${event.requestId}): ${errorMessage}`,
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
        `thumbnail_generate bridge failed for request=${event.requestId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

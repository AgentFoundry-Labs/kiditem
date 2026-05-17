import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AGENT_RUN_EVENTS,
  type AgentRunFinalizedEvent,
} from '../../../agent-os/application/event/agent-run-events';
import {
  AI_AGENT_SOURCE_TYPES,
  DETAIL_PAGE_GENERATE_AGENT_TYPE,
  DetailPageGenerateAgentOutputSchema,
} from '../../domain/agent-output';
import {
  DETAIL_PAGE_AGENT_OUTPUT_SINK_PORT,
  type DetailPageAgentOutputSinkPort,
} from '../port/out/detail-page-agent-output-sink.port';

/**
 * AI domain bridge — listens for `agent.run.finalized` events emitted by the
 * Agent OS executor and routes `detail_page_generate` results back into the
 * AI domain through the sink port.
 *
 * Filtering — strictly on `event.agentType`. The executor sets that field to
 * the resolved Agent OS type when finalizing, so the bridge can identify its
 * own runs without inspecting the in-band `output` payload (output is missing
 * on failure paths). This keeps the failure path symmetric with success: an
 * `agent_run_failed` for `detail_page_generate` reaches this bridge whether
 * or not a runtime ever produced output.
 *
 * The bridge does not write to the database directly. It validates the
 * runtime output against the Zod schema owned by the AI domain and delegates
 * to `DETAIL_PAGE_AGENT_OUTPUT_SINK_PORT`. Phase 1 binds the port to a
 * no-op adapter; Phase 2 swaps it for a real `ContentGeneration` writer.
 *
 * Recovery — the bridge is hot-path only. `AgentRun.output` is the durable
 * record. If the listener crashes or the process restarts before the sink
 * applies the change, a `(agentType, sourceResourceId)`-keyed reconcile job
 * (Phase 2 follow-up) is the recovery path. See agent-os/AGENTS.md
 * "Recovery contract".
 */
@Injectable()
export class DetailPageAgentOutputBridge {
  private readonly logger = new Logger(DetailPageAgentOutputBridge.name);

  constructor(
    @Inject(DETAIL_PAGE_AGENT_OUTPUT_SINK_PORT)
    private readonly sink: DetailPageAgentOutputSinkPort,
  ) {}

  static readonly AGENT_TYPE = DETAIL_PAGE_GENERATE_AGENT_TYPE;
  static readonly SOURCE_TYPE = AI_AGENT_SOURCE_TYPES.DETAIL_PAGE_GENERATE;

  @OnEvent(AGENT_RUN_EVENTS.FINALIZED)
  async onAgentRunFinalized(event: AgentRunFinalizedEvent): Promise<void> {
    if (event.agentType !== DetailPageAgentOutputBridge.AGENT_TYPE) return;
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

      const parsed = DetailPageGenerateAgentOutputSchema.safeParse(event.output);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const errorMessage = issue
          ? `${issue.path.join('.') || '<root>'}: ${issue.message}`
          : 'Output failed schema validation.';
        this.logger.warn(
          `detail_page_generate output rejected (request=${event.requestId}): ${errorMessage}`,
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
      // Never crash the event bus; downstream sinks are best-effort.
      this.logger.warn(
        `detail_page_generate bridge failed for request=${event.requestId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

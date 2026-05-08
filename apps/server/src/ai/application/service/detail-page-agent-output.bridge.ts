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
 * The bridge does not write to the database directly. It validates the
 * runtime output against the Zod schema owned by the AI domain and delegates
 * to `DETAIL_PAGE_AGENT_OUTPUT_SINK_PORT`. Phase 1 binds the port to a
 * no-op adapter; Phase 2 swaps it for a real `ContentGeneration` writer.
 *
 * Filtering: agent type comparison alone is insufficient because the bridge
 * cannot read `AgentRunRequest.agentType` from the bus payload. Instead the
 * producer side sets `sourceType` to `AI_AGENT_SOURCE_TYPES.DETAIL_PAGE_GENERATE`
 * when enqueuing, and the bridge filters on `(agentType, sourceType)` once
 * Phase 2 wires the real producer. Phase 1 still calls the sink for any
 * finalized event that *includes* a `detail_page_generate`-shaped output —
 * the explicit Zod check guarantees we only invoke the sink with a valid
 * payload, regardless of which producer path queued the request.
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
    if (!this.isOurs(event)) return;
    try {
      if (event.status === 'failed') {
        await this.sink.applyFailure({
          organizationId: event.organizationId,
          requestId: event.requestId,
          runId: event.runId,
          sourceResourceId: this.extractSourceResourceId(event),
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
          sourceResourceId: this.extractSourceResourceId(event),
          errorCode: 'agent_output_invalid',
          errorMessage,
        });
        return;
      }

      await this.sink.applySuccess({
        organizationId: event.organizationId,
        requestId: event.requestId,
        runId: event.runId,
        sourceResourceId: this.extractSourceResourceId(event),
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

  private isOurs(event: AgentRunFinalizedEvent): boolean {
    // Phase 1: producer-side sourceType is not yet wired (the AI services
    // still run sync), so we accept any finalized event whose output parses
    // as `detail_page_generate`. The Zod check inside `onAgentRunFinalized`
    // is the actual filter for the success path. Failure events without a
    // matching producer hint are ignored to avoid double-handling other
    // domains' alerts (rules etc.).
    if (event.status === 'failed') {
      const sourceType = this.extractSourceType(event);
      return sourceType === DetailPageAgentOutputBridge.SOURCE_TYPE;
    }
    return true;
  }

  /**
   * The bus payload is intentionally narrow — it carries the IDs and the
   * runtime output but not the producer-side metadata. We probe the output
   * for an optional `__sourceResourceId` envelope here so Phase 2 producers
   * (which will start passing the metadata through `payload.__envelope`) can
   * deliver a downstream resource id without changing the bus shape.
   * Phase 1 always returns null.
   */
  private extractSourceResourceId(event: AgentRunFinalizedEvent): string | null {
    const envelope = this.readEnvelope(event);
    return typeof envelope.sourceResourceId === 'string'
      ? envelope.sourceResourceId
      : null;
  }

  private extractSourceType(event: AgentRunFinalizedEvent): string | null {
    const envelope = this.readEnvelope(event);
    return typeof envelope.sourceType === 'string' ? envelope.sourceType : null;
  }

  private readEnvelope(event: AgentRunFinalizedEvent): Record<string, unknown> {
    if (!event.output || typeof event.output !== 'object') return {};
    const candidate = (event.output as { __envelope?: unknown }).__envelope;
    return candidate && typeof candidate === 'object'
      ? (candidate as Record<string, unknown>)
      : {};
  }
}

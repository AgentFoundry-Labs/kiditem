import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../port/out/agent-os-repository.port';
import {
  AGENT_RUNTIME_PORT,
  type AgentRuntimePort,
} from '../port/out/agent-runtime.port';
import {
  AgentOsRuntimeError,
  normalizeAgentErrorCode,
  normalizeAgentErrorMessage,
} from '../../domain/agent-os.errors';
import { resolveEffectiveModel } from '../../domain/agent-os.types';
import type { AgentRunRequestRecord } from '../../domain/agent-os.types';
import {
  findAgentDefinitionByType,
  resolveDefinitionDefaultModel,
} from '../../domain/agent-definition.registry';
import {
  AGENT_RUN_EVENTS,
  type AgentRunFinalizedEvent,
} from '../event/agent-run-events';

export interface AgentRunExecutorResult {
  executed: boolean;
  requestId?: string;
  runId?: string;
  reason?: string;
  errorCode?: string;
}

/**
 * Bus metadata derived from the claimed `AgentRunRequest`. Threaded into every
 * `emitFinalized` call so listeners can filter on `agentType` / `source`
 * without inspecting the in-band `output` payload (output is missing on
 * failure paths).
 */
interface ClaimedRoutingMetadata {
  agentType: string;
  source: string;
  sourceResourceType: string | null;
  sourceResourceId: string | null;
  requestedByUserId: string | null;
}

function routingFromClaimed(
  claimed: AgentRunRequestRecord,
): ClaimedRoutingMetadata {
  return {
    agentType: claimed.agentType,
    source: claimed.source,
    sourceResourceType: claimed.sourceResourceType,
    sourceResourceId: claimed.sourceResourceId,
    requestedByUserId: claimed.requestedByUserId,
  };
}

@Injectable()
export class AgentRunExecutor {
  private readonly logger = new Logger(AgentRunExecutor.name);

  constructor(
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
    @Inject(AGENT_RUNTIME_PORT)
    private readonly runtime: AgentRuntimePort,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private emitFinalized(event: AgentRunFinalizedEvent): void {
    try {
      this.eventEmitter.emit(AGENT_RUN_EVENTS.FINALIZED, event);
    } catch (err) {
      // Bus emit must never poison the executor — listeners are observability
      // (operation-alert bridge etc.). Worst case the alert stays running and
      // the user dismisses it manually.
      const target = event.runId
        ? `run ${event.runId}`
        : `request ${event.requestId}`;
      this.logger.warn(
        `Failed to emit ${AGENT_RUN_EVENTS.FINALIZED} for ${target}: ${err}`,
      );
    }
  }

  private async failBeforeRun(input: {
    organizationId: string;
    requestId: string;
    routing: ClaimedRoutingMetadata;
    errorCode: string;
    errorMessage: string;
  }): Promise<void> {
    await this.repository.failClaimedRequest({
      organizationId: input.organizationId,
      requestId: input.requestId,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    });
    this.emitFinalized({
      organizationId: input.organizationId,
      requestId: input.requestId,
      ...input.routing,
      status: 'failed',
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    });
  }

  async executeNext(
    workerId: string,
    organizationId: string,
  ): Promise<AgentRunExecutorResult> {
    if (!organizationId) {
      return { executed: false, reason: 'organization_required' };
    }
    const claimed = await this.repository.claimNextRunRequest({
      workerId,
      now: new Date(),
      organizationId,
    });

    if (!claimed) {
      return { executed: false, reason: 'no_pending_request' };
    }
    return this.executeClaimed(claimed);
  }

  /**
   * Worker-friendly variant — claims the next pending request across all
   * organizations. The internal `AgentRunWorker` calls this on its tick to
   * drain the queue platform-wide; the HTTP `claim-and-run` route uses the
   * scoped variant above for explicit per-org operations.
   *
   * Organization scope is preserved on the *downstream* side: the claimed
   * request carries its own `organizationId`, which is threaded through every
   * Prisma write inside `executeClaimed`. Skipping the where-clause filter on
   * the claim itself is the only way for a single internal worker to serve
   * multiple tenants without a per-org thread, and matches the intent of the
   * `claimNextRunRequest({ organizationId: null })` raw SQL path.
   */
  async executeNextUnscoped(workerId: string): Promise<AgentRunExecutorResult> {
    const claimed = await this.repository.claimNextRunRequest({
      workerId,
      now: new Date(),
      organizationId: null,
    });
    if (!claimed) {
      return { executed: false, reason: 'no_pending_request' };
    }
    return this.executeClaimed(claimed);
  }

  private async executeClaimed(
    claimed: AgentRunRequestRecord,
  ): Promise<AgentRunExecutorResult> {
    const routing = routingFromClaimed(claimed);

    const instance = await this.repository.findInstanceById({
      organizationId: claimed.organizationId,
      id: claimed.agentInstanceId,
    });
    if (!instance) {
      await this.failBeforeRun({
        organizationId: claimed.organizationId,
        requestId: claimed.id,
        routing,
        errorCode: 'agent_instance_missing',
        errorMessage: 'Agent instance disappeared after request was queued.',
      });
      return {
        executed: false,
        requestId: claimed.id,
        errorCode: 'agent_instance_missing',
      };
    }

    const definition = findAgentDefinitionByType(instance.type);
    if (!definition) {
      await this.failBeforeRun({
        organizationId: claimed.organizationId,
        requestId: claimed.id,
        routing,
        errorCode: 'agent_definition_missing',
        errorMessage: `No agent definition registered for type "${instance.type}".`,
      });
      return {
        executed: false,
        requestId: claimed.id,
        errorCode: 'agent_definition_missing',
      };
    }

    const requestModelOverride =
      typeof claimed.payload?.model === 'string' && claimed.payload.model.length > 0
        ? (claimed.payload.model as string)
        : null;

    const model = resolveEffectiveModel({
      definitionDefault: resolveDefinitionDefaultModel(definition),
      instanceOverride: instance.modelOverride,
      requestOverride: requestModelOverride,
    });
    if (!model) {
      await this.failBeforeRun({
        organizationId: claimed.organizationId,
        requestId: claimed.id,
        routing,
        errorCode: 'model_required',
        errorMessage: 'Agent execution requires an explicit model.',
      });
      return {
        executed: false,
        requestId: claimed.id,
        errorCode: 'model_required',
      };
    }

    const promptPath = instance.promptPathOverride ?? definition.promptPath;

    const run = await this.repository.createRunForRequest({
      organizationId: claimed.organizationId,
      agentInstanceId: instance.id,
      requestId: claimed.id,
      taskSessionId: claimed.taskSessionId,
      attempt: claimed.attempts,
      invocationSource: claimed.source,
      adapterType: instance.adapterType,
      model,
      taskKey: claimed.taskKey,
      input: claimed.payload,
    });

    await this.repository.appendRunEvent({
      organizationId: run.organizationId,
      runId: run.id,
      agentInstanceId: instance.id,
      type: 'run.started',
      data: { requestId: claimed.id, attempt: run.attempt, model },
    });

    try {
      const result = await this.runtime.execute({
        organizationId: run.organizationId,
        agentInstanceId: instance.id,
        agentType: instance.type,
        requestId: claimed.id,
        runId: run.id,
        taskSessionId: claimed.taskSessionId,
        taskKey: claimed.taskKey,
        adapterType: instance.adapterType,
        model,
        promptPath,
        input: claimed.payload,
        trustLevel: instance.trustLevel,
        runtimeConfig: { ...definition.defaultRuntimeConfig, ...instance.runtimeConfig },
      });

      await this.repository.finalizeRun({
        organizationId: run.organizationId,
        runId: run.id,
        requestId: claimed.id,
        status: 'succeeded',
        output: result.output,
        provider: result.provider ?? null,
        cost:
          result.costMicros === undefined
            ? undefined
            : {
                provider: result.provider ?? 'unknown',
                model,
                inputTokens: result.inputTokens ?? 0,
                outputTokens: result.outputTokens ?? 0,
                cachedInputTokens: result.cachedInputTokens ?? 0,
                costMicros: result.costMicros,
              },
      });

      await this.repository.appendRunEvent({
        organizationId: run.organizationId,
        runId: run.id,
        agentInstanceId: instance.id,
        type: 'run.succeeded',
        data: {
          provider: result.provider ?? null,
          inputTokens: result.inputTokens ?? null,
          outputTokens: result.outputTokens ?? null,
        },
      });

      this.emitFinalized({
        organizationId: run.organizationId,
        requestId: claimed.id,
        runId: run.id,
        ...routing,
        status: 'succeeded',
        output: result.output,
      });

      return { executed: true, requestId: claimed.id, runId: run.id };
    } catch (error) {
      const errorCode = normalizeAgentErrorCode(error);
      const errorMessage = normalizeAgentErrorMessage(error);

      await this.repository.appendRunEvent({
        organizationId: run.organizationId,
        runId: run.id,
        agentInstanceId: instance.id,
        type: 'run.failed',
        level: 'error',
        message: errorMessage,
        data: { errorCode },
      });

      await this.repository.finalizeRun({
        organizationId: run.organizationId,
        runId: run.id,
        requestId: claimed.id,
        status: 'failed',
        errorCode,
        errorMessage,
      });

      if (claimed.attempts >= claimed.maxAttempts) {
        await this.repository.markRequestStatus({
          organizationId: claimed.organizationId,
          requestId: claimed.id,
          status: 'failed',
          errorCode,
          errorMessage,
        });
        // Emit FINALIZED only when the request itself is terminal — retries
        // (status: 'pending') will run again and emit on their final attempt.
        this.emitFinalized({
          organizationId: claimed.organizationId,
          requestId: claimed.id,
          runId: run.id,
          ...routing,
          status: 'failed',
          errorCode,
          errorMessage,
        });
      } else {
        await this.repository.markRequestStatus({
          organizationId: claimed.organizationId,
          requestId: claimed.id,
          status: 'pending',
          errorCode,
          errorMessage,
        });
      }

      return {
        executed: true,
        requestId: claimed.id,
        runId: run.id,
        errorCode,
      };
    }
  }

  /**
   * Surface intentional runtime aborts (eg. cancellation) without crashing the
   * worker loop. Adapter implementations should throw `AgentOsRuntimeError`.
   */
  expectsAbort(error: unknown): boolean {
    return error instanceof AgentOsRuntimeError && error.code === 'aborted';
  }
}

import { Inject, Injectable } from '@nestjs/common';
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

export interface AgentRunExecutorResult {
  executed: boolean;
  requestId?: string;
  runId?: string;
  reason?: string;
  errorCode?: string;
}

@Injectable()
export class AgentRunExecutor {
  constructor(
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
    @Inject(AGENT_RUNTIME_PORT)
    private readonly runtime: AgentRuntimePort,
  ) {}

  async executeNext(workerId: string): Promise<AgentRunExecutorResult> {
    const claimed = await this.repository.claimNextRunRequest({
      workerId,
      now: new Date(),
    });

    if (!claimed) {
      return { executed: false, reason: 'no_pending_request' };
    }

    const instance = await this.repository.findInstanceById({
      organizationId: claimed.organizationId,
      id: claimed.agentInstanceId,
    });
    if (!instance) {
      await this.repository.failClaimedRequest({
        organizationId: claimed.organizationId,
        requestId: claimed.id,
        errorCode: 'agent_instance_missing',
        errorMessage: 'Agent instance disappeared after request was queued.',
      });
      return {
        executed: false,
        requestId: claimed.id,
        errorCode: 'agent_instance_missing',
      };
    }

    const blueprint = await this.repository.findBlueprintByType(instance.type);
    if (!blueprint) {
      await this.repository.failClaimedRequest({
        organizationId: claimed.organizationId,
        requestId: claimed.id,
        errorCode: 'blueprint_missing',
        errorMessage: `No blueprint registered for type "${instance.type}".`,
      });
      return {
        executed: false,
        requestId: claimed.id,
        errorCode: 'blueprint_missing',
      };
    }

    const requestModelOverride =
      typeof claimed.payload?.model === 'string' && claimed.payload.model.length > 0
        ? (claimed.payload.model as string)
        : null;

    const model = resolveEffectiveModel({
      blueprintDefault: blueprint.defaultModel,
      instanceOverride: instance.modelOverride,
      requestOverride: requestModelOverride,
    });
    if (!model) {
      await this.repository.failClaimedRequest({
        organizationId: claimed.organizationId,
        requestId: claimed.id,
        errorCode: 'model_required',
        errorMessage: 'Agent execution requires an explicit model.',
      });
      return {
        executed: false,
        requestId: claimed.id,
        errorCode: 'model_required',
      };
    }

    const promptPath = instance.promptPathOverride ?? blueprint.promptPath;

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
        runtimeConfig: { ...blueprint.defaultRuntimeConfig, ...instance.runtimeConfig },
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

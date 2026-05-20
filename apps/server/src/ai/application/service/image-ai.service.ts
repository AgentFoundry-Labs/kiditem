import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
  type AgentRunnerResult,
} from '../../../agent-os/application/port/in/agent-runner.port';
import {
  AI_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../port/out/cross-domain/operation-alert.port';
import { kickEnqueuedAgentRequest } from './agent-inline-execution';

/**
 * Image edit entry point.
 *
 * Image edits are async by design — heavy/slow work that runs through
 * Agent OS. The legacy `AgentRegistryService.runByType('image_edit', ...)`
 * call site is replaced with a direct dependency on the Agent OS
 * {@link AgentRunnerPort} (`AGENT_RUNNER_PORT`).
 *
 * The legacy `{ taskId }` HTTP contract is preserved for clients that
 * already poll on `taskId`, but the value is now the Agent OS request id.
 * Clients poll `/api/agent-os/requests/:id` and pivot to the run through
 * `latestRunId`. When the runner produces no request/run id the runner's
 * `reason` is surfaced rather than a fabricated id — the "no silent
 * fallback" rule extends to identifier invention.
 *
 * When the runner returns a durable `requestId`, this service also opens a
 * producer-owned operation Alert keyed by the same `agent_run_request` /
 * `<requestId>` pair the operation-alert bridge closes on FINALIZED. Issue
 * #207's safety-net fallback bridge becomes a backstop instead of the
 * primary signal once every Agent OS producer wires its own start() like
 * this.
 */
@Injectable()
export class ImageAiService {
  private readonly logger = new Logger(ImageAiService.name);

  constructor(
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
    @Inject(AI_OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
  ) {}

  async createEditTask(
    params: {
      image_url: string;
      preset: string;
      user_prompt?: string;
      productId?: string;
      contentGenerationId?: string;
    },
    organizationId: string,
    triggeredByUserId: string | null,
  ) {
    let result: AgentRunnerResult;
    try {
      result = await this.agentRunner.runByType('image_edit', {
        organizationId,
        sourceType: 'ai.image_edit',
        reason: 'image-ai edit',
        payload: {
          image_url: params.image_url,
          preset: params.preset,
          user_prompt: params.user_prompt ?? '',
          ...(params.productId ? { productId: params.productId } : {}),
          ...(params.contentGenerationId
            ? { contentGenerationId: params.contentGenerationId }
            : {}),
        },
        ...(triggeredByUserId ? { requestedByUserId: triggeredByUserId } : {}),
      });
    } catch (error) {
      throw error;
    }

    let taskId: string;
    taskId = this.requireTaskId(result, 'ai.image_edit');

    if (result.requestId) {
      await this.operationAlerts.start({
        organizationId,
        operationKey: `image-edit:${result.requestId}`,
        type: 'image_edit',
        title: '이미지 편집 진행 중',
        sourceType: 'agent_run_request',
        sourceId: result.requestId,
        actorUserId: triggeredByUserId,
        href: this.imageEditHref(params),
        metadata: {
          agentType: 'image_edit',
          preset: params.preset,
          productId: params.productId ?? null,
          contentGenerationId: params.contentGenerationId ?? null,
        },
      });
      this.kickEnqueuedImageEditRequest({
        organizationId,
        requestId: result.requestId,
      });
    }

    return { taskId };
  }

  private imageEditHref(params: { productId?: string; contentGenerationId?: string }): string {
    if (params.contentGenerationId) {
      return `/product-pipeline/detail-pages/${encodeURIComponent(params.contentGenerationId)}/editor`;
    }
    if (params.productId) return `/product-pipeline/registered-products?masterId=${params.productId}`;
    return '/product-pipeline/registered-products?contentType=image';
  }

  private kickEnqueuedImageEditRequest(input: {
    organizationId: string;
    requestId: string;
  }): void {
    if (!this.agentRunner.executeRequest) return;

    kickEnqueuedAgentRequest({
      agentRunner: this.agentRunner,
      organizationId: input.organizationId,
      requestId: input.requestId,
      workerId: 'image-edit-inline',
      logger: this.logger,
      label: 'image_edit',
    });
  }

  private requireTaskId(result: AgentRunnerResult, sourceType: string): string {
    const taskId = result.requestId ?? result.runId;
    if (!taskId) {
      throw new InternalServerErrorException(
        `Agent OS runner returned no runId/requestId for ${sourceType}` +
          (result.reason ? ` (${result.reason})` : ''),
      );
    }
    return taskId;
  }
}

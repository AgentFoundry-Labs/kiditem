import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../../../agent-os/application/port/in/agent-runner.port';
import {
  AI_GENERATION_CANCELLATION_PORT,
  type AiGenerationCancellationPort,
} from '../../../ai/application/port/in/ai-generation-cancellation.port';
import {
  OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../../../automation/application/port/in/operation-alert.port';
import {
  WORKFLOW_RUN_CANCELLATION_PORT,
  type WorkflowRunCancellationPort,
} from '../../../automation/application/port/in/workflow-run-cancellation.port';
import {
  type CancelOperationCommand,
  type CancelOperationTarget,
  type CancelOperationResult,
  emptyAffected,
  emptyPreserved,
} from './operation-cancellation.types';
import {
  operationCancellationAudit,
  type OperationCancellationTargetAudit,
} from '../../../common/operation-cancellation-audit';

const TERMINAL_OPERATION_STATUSES = new Set([
  'succeeded',
  'failed',
  'cancelled',
  'resolved',
]);
const DEFAULT_REASON = '사용자 요청으로 중단되었습니다.';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pushUnique(list: string[], value: string | null | undefined): void {
  if (value && !list.includes(value)) list.push(value);
}

function reasonFrom(command: CancelOperationCommand): string {
  const raw = command.target.reason?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_REASON;
}

function auditTargetFrom(target: CancelOperationTarget): OperationCancellationTargetAudit {
  switch (target.targetType) {
    case 'operation_key':
      return { targetType: 'operation_key', operationKey: target.operationKey };
    case 'workflow_run':
      return { targetType: 'workflow_run', runId: target.runId };
    case 'agent_run_request':
      return { targetType: 'agent_run_request', requestId: target.requestId };
    case 'agent_run':
      return { targetType: 'agent_run', runId: target.runId };
    case 'content_generation':
      return { targetType: 'content_generation', generationId: target.generationId };
    case 'thumbnail_generation':
      return { targetType: 'thumbnail_generation', generationId: target.generationId };
  }
}

function childIdsFrom(metadata: unknown): {
  detailPageGenerationId: string | null;
  thumbnailGenerationId: string | null;
} {
  const childIds = asRecord(asRecord(metadata).childIds);
  return {
    detailPageGenerationId:
      typeof childIds.detailPageGenerationId === 'string'
        ? childIds.detailPageGenerationId
        : null,
    thumbnailGenerationId:
      typeof childIds.thumbnailGenerationId === 'string'
        ? childIds.thumbnailGenerationId
        : null,
  };
}

@Injectable()
export class OperationCancellationService {
  constructor(
    @Inject(OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
    @Inject(WORKFLOW_RUN_CANCELLATION_PORT)
    private readonly workflows: WorkflowRunCancellationPort,
    @Inject(AGENT_RUNNER_PORT)
    private readonly agentRunner: AgentRunnerPort,
    @Inject(AI_GENERATION_CANCELLATION_PORT)
    private readonly ai: AiGenerationCancellationPort,
  ) {}

  async cancel(command: CancelOperationCommand): Promise<CancelOperationResult> {
    switch (command.target.targetType) {
      case 'operation_key':
        return this.cancelByOperationKey(command);
      case 'workflow_run':
        return this.cancelWorkflowRun(command, command.target.runId, null);
      case 'agent_run_request':
        return this.cancelAgentRunRequest(command, command.target.requestId, null);
      case 'agent_run':
        return this.cancelAgentRun(command, command.target.runId, null);
      case 'content_generation':
        return this.cancelContentGeneration(command, command.target.generationId, null);
      case 'thumbnail_generation':
        return this.cancelThumbnailGeneration(command, command.target.generationId, null);
    }
  }

  private async cancelByOperationKey(
    command: CancelOperationCommand,
  ): Promise<CancelOperationResult> {
    if (command.target.targetType !== 'operation_key') {
      throw new Error('cancelByOperationKey requires operation_key target');
    }
    const alert = await this.operationAlerts.findByOperationKey(
      command.organizationId,
      command.target.operationKey,
    );
    if (!alert) {
      throw new NotFoundException(
        `operation alert not found: ${command.target.operationKey}`,
      );
    }
    if (TERMINAL_OPERATION_STATUSES.has(alert.status)) {
      return {
        ok: true,
        status: 'already_terminal',
        message: '이미 완료되었거나 중단된 작업입니다.',
        operationKey: command.target.operationKey,
        affected: emptyAffected(),
        preserved: emptyPreserved(),
        warnings: [],
      };
    }

    const affected = emptyAffected();
    const preserved = emptyPreserved();
    const warnings: string[] = [];
    const reason = reasonFrom(command);
    const childIds = childIdsFrom(alert.metadata);

    await this.cancelContentChild(command, childIds.detailPageGenerationId, affected, preserved, reason);
    await this.cancelThumbnailChild(command, childIds.thumbnailGenerationId, affected, preserved, reason);

    if (alert.sourceType === 'content_generation') {
      await this.cancelContentChild(command, alert.sourceId, affected, preserved, reason);
    }
    if (alert.sourceType === 'thumbnail_generation') {
      await this.cancelThumbnailChild(command, alert.sourceId, affected, preserved, reason);
    }
    if (alert.sourceType === 'agent_run_request' && alert.sourceId) {
      const result = await this.agentRunner.cancelRequest?.({
        organizationId: command.organizationId,
        requestId: alert.sourceId,
        reason,
        actorUserId: command.actorUserId,
      });
      if (result?.cancelledRequests) pushUnique(affected.agentRunRequestIds, alert.sourceId);
      if (result?.cancelledRuns) pushUnique(affected.agentRunIds, `request:${alert.sourceId}:running`);
    }
    if (alert.sourceType === 'agent_run' && alert.sourceId) {
      const result = await this.agentRunner.cancelRun?.({
        organizationId: command.organizationId,
        runId: alert.sourceId,
        reason,
        actorUserId: command.actorUserId,
      });
      if (result?.cancelledRuns) pushUnique(affected.agentRunIds, alert.sourceId);
      if (result?.cancelledRequests) pushUnique(affected.agentRunRequestIds, `run:${alert.sourceId}:request`);
    }
    if (alert.sourceType === 'workflow_run' && alert.sourceId) {
      const result = await this.workflows.cancelRun({
        runId: alert.sourceId,
        organizationId: command.organizationId,
        actorUserId: command.actorUserId,
        reason,
      });
      if (result.status === 'cancelled') pushUnique(affected.workflowRunIds, alert.sourceId);
      if (result.cancelledAgentRunRequests > 0) {
        pushUnique(
          affected.agentRunRequestIds,
          `linked:${alert.sourceId}:${result.cancelledAgentRunRequests}`,
        );
      }
      if (result.cancelledAgentRuns > 0) {
        pushUnique(affected.agentRunIds, `linked:${alert.sourceId}:${result.cancelledAgentRuns}`);
      }
    }

    const hasAnyEffect =
      affected.workflowRunIds.length +
      affected.agentRunRequestIds.length +
      affected.agentRunIds.length +
      affected.contentGenerationIds.length +
      affected.thumbnailGenerationIds.length +
      preserved.contentGenerationIds.length +
      preserved.thumbnailGenerationIds.length >
      0;

    if (!hasAnyEffect) {
      return {
        ok: true,
        status: 'not_cancellable',
        message: '이 작업은 서버에서 중단 가능한 실행 대상을 찾지 못했습니다.',
        operationKey: command.target.operationKey,
        affected,
        preserved,
        warnings,
      };
    }

    await this.operationAlerts.cancel(command.organizationId, command.target.operationKey, {
      message:
        preserved.contentGenerationIds.length + preserved.thumbnailGenerationIds.length > 0
          ? '완료된 결과는 유지하고 진행 중인 작업을 중단했습니다.'
          : '진행 중인 작업을 중단했습니다.',
      metadata: {
        cancel: {
          ...operationCancellationAudit({
            requestedByUserId: command.actorUserId,
            reason,
            target: auditTargetFrom(command.target),
            affected,
            preserved,
            result: 'cancelled',
          }),
          requestedByUserId: command.actorUserId,
          reason,
          completedChildren: preserved,
          cancelledChildren: {
            contentGenerationIds: affected.contentGenerationIds,
            thumbnailGenerationIds: affected.thumbnailGenerationIds,
          },
        },
      },
    });

    return {
      ok: true,
      status: 'cancelled',
      message:
        preserved.contentGenerationIds.length + preserved.thumbnailGenerationIds.length > 0
          ? '일부 완료된 결과를 유지하고 작업을 중단했습니다.'
          : '중단 요청이 반영되었습니다.',
      operationKey: command.target.operationKey,
      affected,
      preserved,
      warnings,
    };
  }

  private async cancelWorkflowRun(
    command: CancelOperationCommand,
    runId: string,
    operationKey: string | null,
  ): Promise<CancelOperationResult> {
    const result = await this.workflows.cancelRun({
      runId,
      organizationId: command.organizationId,
      actorUserId: command.actorUserId,
      reason: reasonFrom(command),
    });
    if (result.status === 'not_found') {
      throw new NotFoundException(`workflow run not found: ${runId}`);
    }
    const affected = emptyAffected();
    if (result.status === 'cancelled') {
      pushUnique(affected.workflowRunIds, runId);
      if (result.cancelledAgentRunRequests > 0) {
        pushUnique(affected.agentRunRequestIds, `linked:${runId}:${result.cancelledAgentRunRequests}`);
      }
      if (result.cancelledAgentRuns > 0) {
        pushUnique(affected.agentRunIds, `linked:${runId}:${result.cancelledAgentRuns}`);
      }
    }
    return {
      ok: true,
      status: result.status === 'already_terminal' ? 'already_terminal' : 'cancelled',
      message:
        result.status === 'already_terminal'
          ? '이미 완료되었거나 중단된 워크플로우입니다.'
          : '워크플로우 중단 요청이 반영되었습니다.',
      operationKey,
      affected,
      preserved: emptyPreserved(),
      warnings: [],
    };
  }

  private async cancelAgentRunRequest(
    command: CancelOperationCommand,
    requestId: string,
    operationKey: string | null,
  ): Promise<CancelOperationResult> {
    const result = await this.agentRunner.cancelRequest?.({
      organizationId: command.organizationId,
      requestId,
      reason: reasonFrom(command),
      actorUserId: command.actorUserId,
    });
    const affected = emptyAffected();
    if (result?.cancelledRequests) pushUnique(affected.agentRunRequestIds, requestId);
    if (result?.cancelledRuns) pushUnique(affected.agentRunIds, `request:${requestId}:running`);
    const cancelled = result ? result.cancelledRequests + result.cancelledRuns > 0 : false;
    return {
      ok: true,
      status: cancelled ? 'cancelled' : 'already_terminal',
      message: cancelled
        ? '에이전트 작업 중단 요청이 반영되었습니다.'
        : '이미 완료되었거나 중단된 에이전트 작업입니다.',
      operationKey,
      affected,
      preserved: emptyPreserved(),
      warnings: result ? [] : ['Agent OS cancellation port is not available.'],
    };
  }

  private async cancelAgentRun(
    command: CancelOperationCommand,
    runId: string,
    operationKey: string | null,
  ): Promise<CancelOperationResult> {
    const result = await this.agentRunner.cancelRun?.({
      organizationId: command.organizationId,
      runId,
      reason: reasonFrom(command),
      actorUserId: command.actorUserId,
    });
    const affected = emptyAffected();
    if (result?.cancelledRuns) pushUnique(affected.agentRunIds, runId);
    if (result?.cancelledRequests) pushUnique(affected.agentRunRequestIds, `run:${runId}:request`);
    const cancelled = result ? result.cancelledRuns + result.cancelledRequests > 0 : false;
    return {
      ok: true,
      status: cancelled ? 'cancelled' : 'already_terminal',
      message: cancelled
        ? '에이전트 실행 중단 요청이 기록되었습니다.'
        : '이미 완료되었거나 중단된 에이전트 실행입니다.',
      operationKey,
      affected,
      preserved: emptyPreserved(),
      warnings: result ? [] : ['Agent OS cancellation port is not available.'],
    };
  }

  private async cancelContentGeneration(
    command: CancelOperationCommand,
    generationId: string,
    operationKey: string | null,
  ): Promise<CancelOperationResult> {
    const result = await this.ai.cancelContentGeneration({
      organizationId: command.organizationId,
      generationId,
      actorUserId: command.actorUserId,
      reason: reasonFrom(command),
    });
    if (result.status === 'not_found') {
      throw new NotFoundException(`content generation not found: ${generationId}`);
    }
    const affected = emptyAffected();
    const preserved = emptyPreserved();
    if (result.status === 'cancelled') pushUnique(affected.contentGenerationIds, generationId);
    if (result.preserved) pushUnique(preserved.contentGenerationIds, generationId);
    return {
      ok: true,
      status: result.status === 'already_terminal' ? 'already_terminal' : 'cancelled',
      message:
        result.status === 'already_terminal'
          ? '이미 완료되었거나 중단된 상세페이지 생성입니다.'
          : '상세페이지 생성 중단 요청이 반영되었습니다.',
      operationKey: operationKey ? operationKey : result.operationKey,
      affected,
      preserved,
      warnings: [],
    };
  }

  private async cancelThumbnailGeneration(
    command: CancelOperationCommand,
    generationId: string,
    operationKey: string | null,
  ): Promise<CancelOperationResult> {
    const result = await this.ai.cancelThumbnailGeneration({
      organizationId: command.organizationId,
      generationId,
      actorUserId: command.actorUserId,
      reason: reasonFrom(command),
    });
    if (result.status === 'not_found') {
      throw new NotFoundException(`thumbnail generation not found: ${generationId}`);
    }
    const affected = emptyAffected();
    const preserved = emptyPreserved();
    if (result.status === 'cancelled') pushUnique(affected.thumbnailGenerationIds, generationId);
    if (result.preserved) pushUnique(preserved.thumbnailGenerationIds, generationId);
    return {
      ok: true,
      status: result.status === 'already_terminal' ? 'already_terminal' : 'cancelled',
      message:
        result.status === 'already_terminal'
          ? '이미 완료되었거나 중단된 썸네일 생성입니다.'
          : '썸네일 생성 중단 요청이 반영되었습니다.',
      operationKey: operationKey ? operationKey : result.operationKey,
      affected,
      preserved,
      warnings: [],
    };
  }

  private async cancelContentChild(
    command: CancelOperationCommand,
    generationId: string | null,
    affected: ReturnType<typeof emptyAffected>,
    preserved: ReturnType<typeof emptyPreserved>,
    reason: string,
  ): Promise<void> {
    if (!generationId) return;
    const result = await this.ai.cancelContentGeneration({
      organizationId: command.organizationId,
      generationId,
      actorUserId: command.actorUserId,
      reason,
    });
    if (result.status === 'cancelled') pushUnique(affected.contentGenerationIds, result.generationId);
    if (result.preserved) pushUnique(preserved.contentGenerationIds, result.generationId);
  }

  private async cancelThumbnailChild(
    command: CancelOperationCommand,
    generationId: string | null,
    affected: ReturnType<typeof emptyAffected>,
    preserved: ReturnType<typeof emptyPreserved>,
    reason: string,
  ): Promise<void> {
    if (!generationId) return;
    const result = await this.ai.cancelThumbnailGeneration({
      organizationId: command.organizationId,
      generationId,
      actorUserId: command.actorUserId,
      reason,
    });
    if (result.status === 'cancelled') pushUnique(affected.thumbnailGenerationIds, result.generationId);
    if (result.preserved) pushUnique(preserved.thumbnailGenerationIds, result.generationId);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { HeartbeatService } from '../../heartbeat/heartbeat.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AGENT_EVENTS, AgentStatusChangedEvent } from '../../events/agent-events';
import type { WorkflowYield, WorkflowStep } from '@kiditem/shared';

export interface WorkflowStepDefinition {
  type: 'run_agent' | 'approval_needed';
  agentType?: string;
  message?: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class ManagerWorkflowService {
  private readonly logger = new Logger(ManagerWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly heartbeat: HeartbeatService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * 워크플로우 시작. DB에 워크플로우 레코드를 생성하고 첫 번째 step까지 실행.
   * 승인이 필요한 step에서 멈추고 workflow ID를 반환.
   */
  async startWorkflow(input: {
    agentId: string;
    companyId: string;
    type: string;
    steps: WorkflowStepDefinition[];
    initialInput?: Record<string, unknown>;
  }): Promise<{ workflowId: string; yield: WorkflowYield }> {
    const workflow = await this.prisma.agentWorkflow.create({
      data: {
        agent: { connect: { id: input.agentId } },
        company: { connect: { id: input.companyId } },
        type: input.type,
        status: 'running',
        currentStep: 0,
        state: {},
        steps: [],
        input: input.initialInput
          ? (input.initialInput as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    this.logger.log(`Workflow started: ${workflow.id} (type=${input.type})`);

    const result = await this.executeUntilPause(workflow.id, input.steps, {}, input.companyId);
    return { workflowId: workflow.id, yield: result };
  }

  /**
   * 승인 후 워크플로우 재개.
   */
  async resumeWorkflow(workflowId: string, approval: {
    approved: boolean;
    data?: Record<string, unknown>;
  }): Promise<{ yield: WorkflowYield }> {
    const workflow = await this.prisma.agentWorkflow.findUnique({ where: { id: workflowId } });
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    if (workflow.status !== 'awaiting_approval') {
      throw new Error(`Workflow ${workflowId} is not awaiting approval (status: ${workflow.status})`);
    }

    if (!approval.approved) {
      await this.prisma.agentWorkflow.update({
        where: { id: workflowId },
        data: { status: 'cancelled', error: 'User rejected approval' },
      });
      return { yield: { type: 'failed', error: 'User rejected approval' } };
    }

    // 다음 step부터 재개
    const inputData = workflow.input as Record<string, unknown> | null;
    const stepDefs = (inputData?._stepDefs as WorkflowStepDefinition[]) ?? [];
    const state = { ...(workflow.state as Record<string, unknown>), ...approval.data };
    const result = await this.executeUntilPause(workflowId, stepDefs, state, workflow.companyId);
    return { yield: result };
  }

  /**
   * 워크플로우를 승인 필요 step 또는 완료까지 실행.
   */
  private async executeUntilPause(
    workflowId: string,
    stepDefs: WorkflowStepDefinition[],
    state: Record<string, unknown>,
    companyId: string,
  ): Promise<WorkflowYield> {
    const workflow = await this.prisma.agentWorkflow.findUnique({ where: { id: workflowId } });
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

    const currentStep = workflow.currentStep;
    const steps = (workflow.steps as WorkflowStep[]) ?? [];
    const currentState = { ...state };

    // step 정의를 state에 보관 (resume 시 사용)
    const existingInput = (workflow.input as Record<string, unknown>) ?? {};
    await this.prisma.agentWorkflow.update({
      where: { id: workflowId },
      data: {
        input: { ...existingInput, _stepDefs: stepDefs.map(s => ({ ...s })) } as unknown as Prisma.InputJsonValue,
      },
    });

    for (let i = currentStep; i < stepDefs.length; i++) {
      const stepDef = stepDefs[i];

      if (stepDef.type === 'run_agent' && stepDef.agentType) {
        // specialist 에이전트 실행
        const stepRecord: WorkflowStep = {
          index: i,
          type: 'run_agent',
          agentType: stepDef.agentType,
          message: stepDef.message,
          startedAt: new Date().toISOString(),
        };

        try {
          const agentDef = await this.prisma.agentDefinition.findUnique({
            where: { type: stepDef.agentType },
          });
          if (!agentDef) throw new Error(`Agent type ${stepDef.agentType} not found`);

          const wakeResult = await this.heartbeat.wakeAgent({
            agentId: agentDef.id,
            companyId,
            source: 'assignment',
            reason: `Workflow ${workflowId} step ${i}`,
            payload: { ...stepDef.payload, ...currentState },
            requestedByType: 'workflow',
            requestedById: workflowId,
          });

          stepRecord.completedAt = new Date().toISOString();
          stepRecord.data = { wakeResult };
          steps.push(stepRecord);

          // 상태 업데이트
          currentState[`step_${i}_result`] = wakeResult;
          await this.prisma.agentWorkflow.update({
            where: { id: workflowId },
            data: {
              currentStep: i + 1,
              state: currentState as unknown as Prisma.InputJsonValue,
              steps: steps as unknown as Prisma.InputJsonValue,
            },
          });
        } catch (err: any) {
          stepRecord.completedAt = new Date().toISOString();
          stepRecord.type = 'failed';
          stepRecord.data = { error: err.message };
          steps.push(stepRecord);

          await this.prisma.agentWorkflow.update({
            where: { id: workflowId },
            data: {
              status: 'failed',
              error: err.message,
              steps: steps as unknown as Prisma.InputJsonValue,
            },
          });

          return { type: 'failed', error: err.message };
        }
      }

      if (stepDef.type === 'approval_needed') {
        // 승인 필요: 여기서 멈춤
        const stepRecord: WorkflowStep = {
          index: i,
          type: 'approval_needed',
          message: stepDef.message,
          startedAt: new Date().toISOString(),
          data: currentState,
        };
        steps.push(stepRecord);

        await this.prisma.agentWorkflow.update({
          where: { id: workflowId },
          data: {
            status: 'awaiting_approval',
            currentStep: i + 1,
            state: currentState as unknown as Prisma.InputJsonValue,
            steps: steps as unknown as Prisma.InputJsonValue,
          },
        });

        this.eventEmitter.emit(AGENT_EVENTS.STATUS_CHANGED, new AgentStatusChangedEvent(
          workflow.agentId, 'workflow', 'paused', workflowId, { reason: 'awaiting_approval' },
        ));

        return {
          type: 'approval_needed',
          message: stepDef.message ?? '승인이 필요합니다',
          data: currentState,
          step: i,
        };
      }
    }

    // 모든 step 완료
    await this.prisma.agentWorkflow.update({
      where: { id: workflowId },
      data: {
        status: 'completed',
        output: currentState as unknown as Prisma.InputJsonValue,
        steps: steps as unknown as Prisma.InputJsonValue,
      },
    });

    return { type: 'completed', result: currentState };
  }

  // ── 조회 ──

  async getWorkflow(workflowId: string) {
    return this.prisma.agentWorkflow.findUnique({ where: { id: workflowId } });
  }

  async listWorkflows(companyId: string, limit = 20) {
    return this.prisma.agentWorkflow.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AgentDefinition } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { AGENT_EVENTS, AgentStatusChangedEvent } from '../../../agent-registry/events/agent-events';
import { PrismaService } from '../../../prisma/prisma.service';
import { ThumbnailGenerationService } from './thumbnail-generation.service';

const AGENT_TYPE = 'thumbnail_auto_edit';
const AGENT_NAME = 'Thumbnail Auto Edit';

type AutoBatchResult = Awaited<ReturnType<ThumbnailGenerationService['createAutoBatch']>>;

@Injectable()
export class ThumbnailAutoService implements OnModuleInit {
  private readonly logger = new Logger(ThumbnailAutoService.name);
  private cachedAgentId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly generationService: ThumbnailGenerationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureAgentDefinition();
    } catch (err) {
      this.logger.warn(
        `AgentDefinition upsert 실패 (부팅 중): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async runBatch(companyId: string, limit = 30): Promise<AutoBatchResult & { runId: string }> {
    const agentId = await this.ensureAgentDefinition();
    const run = await this.prisma.heartbeatRun.create({
      data: {
        agentId,
        companyId,
        invocationSource: 'on_demand',
        triggerDetail: `thumbnail-auto batch limit=${limit}`,
        status: 'running',
        startedAt: new Date(),
      },
      select: { id: true },
    });

    this.emitStatus(agentId, 'running', companyId, run.id, { limit });

    try {
      const result = await this.generationService.createAutoBatch(companyId, limit);
      await this.prisma.heartbeatRun.update({
        where: { id: run.id },
        data: {
          status: 'succeeded',
          finishedAt: new Date(),
          resultJson: result as unknown as Prisma.InputJsonValue,
        },
      });
      this.emitStatus(agentId, 'succeeded', companyId, run.id, {
        attempted: result.attempted,
        succeeded: result.succeeded,
        failed: result.failed,
        skipped: result.skipped,
      });
      return { ...result, runId: run.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.heartbeatRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          error: message,
          resultJson: { limit } as Prisma.InputJsonValue,
        },
      });
      this.emitStatus(agentId, 'failed', companyId, run.id, { error: message });
      throw err;
    }
  }

  private async ensureAgentDefinition(): Promise<string> {
    if (this.cachedAgentId) return this.cachedAgentId;

    const existing = await this.prisma.agentDefinition.findUnique({
      where: { type: AGENT_TYPE },
    });
    if (existing) {
      this.cachedAgentId = existing.id;
      return existing.id;
    }

    const created: AgentDefinition = await this.prisma.agentDefinition.create({
      data: {
        type: AGENT_TYPE,
        name: AGENT_NAME,
        description: 'A등급 상품 썸네일 자동 재편집. 현재 스키마의 generation job을 예약하고 결과를 에이전트 실행 이력으로 남긴다.',
        adapterType: 'claude_local',
        role: 'specialist',
        title: 'A등급 자동 재편집',
        icon: 'image',
        promptTemplate: 'agent-config/prompts/agents/thumbnail-auto-edit.md',
        isActive: true,
        requiresApproval: false,
        skills: [],
        permissions: {},
        fallbackChain: ['claude_local'],
      },
    });
    this.cachedAgentId = created.id;
    this.logger.log(`AgentDefinition(${AGENT_TYPE}) 생성됨: ${created.id}`);
    return created.id;
  }

  private emitStatus(
    agentId: string,
    status: 'running' | 'succeeded' | 'failed',
    companyId: string,
    runId: string,
    data: Record<string, unknown>,
  ): void {
    this.eventEmitter.emit(
      AGENT_EVENTS.STATUS_CHANGED,
      new AgentStatusChangedEvent(agentId, AGENT_NAME, status, companyId, runId, data),
    );
  }
}

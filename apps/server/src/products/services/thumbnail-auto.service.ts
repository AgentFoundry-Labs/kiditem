import { Injectable, Logger, OnModuleInit, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AgentDefinition } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ThumbnailAiService } from './thumbnail-ai.service';
import { ThumbnailGenerationService } from './thumbnail-generation.service';
import {
  AGENT_EVENTS,
  AgentStatusChangedEvent,
} from '../../agent-registry/events/agent-events';
import { PANEL_EVENTS } from '../../panel/events/panel-events';
import { alertPanelAdapter } from '../../panel/adapters/alert.adapter';

const AGENT_TYPE = 'thumbnail_auto_edit';
const AGENT_NAME = 'Thumbnail Auto Edit';
const COOLDOWN_DAYS = 7;

export type AutoEditTrigger = 'manual' | 'cron';

export interface AutoEditResult {
  ok: boolean;
  runId: string;
  productId: string;
  generationId?: string | null;
  classification?: {
    bucket: string;
    editCase: string;
    suggestBoxImage: boolean;
    reason: string;
  };
  suggestionNotified?: boolean;
  error?: string;
}

@Injectable()
export class ThumbnailAutoService implements OnModuleInit {
  private readonly logger = new Logger(ThumbnailAutoService.name);
  private cachedAgentId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly thumbnailAi: ThumbnailAiService,
    private readonly generationService: ThumbnailGenerationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureAgentDefinition();
    } catch (err) {
      this.logger.warn(
        `AgentDefinition upsert 실패 (부팅 중): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** AgentDefinition 이 없으면 lazy upsert. companyId=null (전역 정의). */
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
        description: 'A등급 상품 썸네일 자동 재편집. 상품 이미지를 분류 → 시나리오 블록으로 재생성 → 결과 저장.',
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

  /** 단일 상품 자동 재편집. HeartbeatRun 을 만들어 Agent-OS 에 visible. */
  async runOne(
    productId: string,
    companyId: string,
    trigger: AutoEditTrigger = 'manual',
  ): Promise<AutoEditResult> {
    const agentId = await this.ensureAgentDefinition();

    const run = await this.prisma.heartbeatRun.create({
      data: {
        agentId,
        companyId,
        invocationSource: trigger === 'cron' ? 'scheduled' : 'on_demand',
        triggerDetail: `productId=${productId}`,
        status: 'running',
        startedAt: new Date(),
      },
    });

    this.eventEmitter.emit(
      AGENT_EVENTS.STATUS_CHANGED,
      new AgentStatusChangedEvent(agentId, AGENT_NAME, 'running', companyId, run.id, {
        productId,
      }),
    );

    try {
      const product = await this.prisma.product.findFirst({
        where: { id: productId, companyId },
        select: { id: true, imageUrl: true, category: true, images: true, abcGrade: true },
      });
      if (!product) throw new NotFoundException(`Product ${productId} not found`);
      if (!product.imageUrl) throw new Error('imageUrl 없음 — 원본 이미지가 필요합니다');

      const imageData = await this.thumbnailAi.fetchImageAsBase64Public(product.imageUrl);

      const classification = await this.thumbnailAi.classifyForAutoEdit(imageData, product.category);

      const hasBoxImage = Array.isArray(product.images)
        ? (product.images as Array<{ role?: string }>).some(
            (img) => img && typeof img === 'object' && img.role === 'box',
          )
        : false;
      const shouldSuggestBox = classification.suggestBoxImage && !hasBoxImage;
      let suggestionNotified = false;
      if (shouldSuggestBox) {
        this.logger.log(
          `[auto-edit] 박스 이미지 제안 (productId=${productId}): ${classification.reason}`,
        );
        try {
          const alert = await this.prisma.alert.create({
            data: {
              companyId,
              productId,
              type: 'thumbnail_auto_edit_box_suggested',
              severity: 'info',
              title: '박스 이미지 추가 권장',
              message: classification.reason,
            },
          });
          this.eventEmitter.emit(PANEL_EVENTS.UPSERT, {
            item: alertPanelAdapter.mapToItem(alert),
            companyId,
          });
          suggestionNotified = true;
        } catch (err) {
          this.logger.warn(
            `Alert 생성 실패 (productId=${productId}): ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      const results = await this.thumbnailAi.generateFromInputs(
        [{ data: imageData.data, mimeType: imageData.mimeType, label: 'Product photo' }],
        undefined,
        'compliance',
        undefined,
        product.category,
        classification.editCase,
      );

      const generationId = await this.generationService.saveEditorResult({
        productId: product.id,
        companyId,
        originalUrl: product.imageUrl,
        candidates: results,
        method: 'generate',
      });

      await this.prisma.heartbeatRun.update({
        where: { id: run.id },
        data: {
          status: 'succeeded',
          finishedAt: new Date(),
          resultJson: {
            productId,
            generationId,
            classification,
            suggestionNotified,
            candidateCount: results.length,
          },
        },
      });

      this.eventEmitter.emit(
        AGENT_EVENTS.STATUS_CHANGED,
        new AgentStatusChangedEvent(agentId, AGENT_NAME, 'succeeded', companyId, run.id, {
          productId,
          generationId,
        }),
      );

      return {
        ok: true,
        runId: run.id,
        productId,
        generationId,
        classification,
        suggestionNotified,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.heartbeatRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          error: message,
          resultJson: { productId },
        },
      });

      this.eventEmitter.emit(
        AGENT_EVENTS.STATUS_CHANGED,
        new AgentStatusChangedEvent(agentId, AGENT_NAME, 'failed', companyId, run.id, {
          productId,
          error: message,
        }),
      );

      this.logger.error(`[auto-edit] 실패 (productId=${productId}): ${message}`);
      return { ok: false, runId: run.id, productId, error: message };
    }
  }

  /** A등급 상품 배치 실행. 7일 쿨다운 dedup. */
  async runBatch(
    companyId: string,
    limit = 30,
    trigger: AutoEditTrigger = 'manual',
  ): Promise<{ attempted: number; succeeded: number; failed: number; skipped: number; runs: AutoEditResult[] }> {
    const agentId = await this.ensureAgentDefinition();
    const cooldown = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

    // A등급 + imageUrl 있는 상품만. 쿨다운으로 걸러질 것 감안 넉넉히.
    const products = await this.prisma.product.findMany({
      where: {
        companyId,
        abcGrade: 'A',
        imageUrl: { not: null },
      },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
      take: limit * 3,
    });

    const runs: AutoEditResult[] = [];
    let skipped = 0;

    for (const product of products) {
      if (runs.length >= limit) break;

      const recent = await this.prisma.heartbeatRun.findFirst({
        where: {
          agentId,
          companyId,
          status: 'succeeded',
          startedAt: { gte: cooldown },
          resultJson: { path: ['productId'], equals: product.id },
        },
        select: { id: true },
      });
      if (recent) {
        skipped++;
        continue;
      }

      const r = await this.runOne(product.id, companyId, trigger);
      runs.push(r);
    }

    const succeeded = runs.filter((r) => r.ok).length;
    return {
      attempted: runs.length,
      succeeded,
      failed: runs.length - succeeded,
      skipped,
      runs,
    };
  }
}

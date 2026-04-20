import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { PanelItem } from '@kiditem/shared';
import { workflowPanelAdapter } from './adapters/workflow.adapter';
import { agentPanelAdapter } from './adapters/agent.adapter';
import { imagePanelAdapter } from './adapters/image.adapter';
import { alertPanelAdapter } from './adapters/alert.adapter';

@Injectable()
export class PanelService {
  private readonly logger = new Logger(PanelService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 현재 Panel에 표시되어야 할 아이템 전체.
   * - 진행 중 run (pending/running)
   * - 최근 24h terminal run
   * PR1: workflow source만. PR2에서 agent, image_edit, alert 추가.
   */
  async snapshot(companyId: string, currentUserId: string): Promise<Array<Omit<PanelItem, 'seq' | 'updatedAt'>>> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600 * 1000);

    const workflowRuns = await this.prisma.workflowRun.findMany({
      where: {
        companyId,
        OR: [
          { status: { in: ['pending', 'running'] } },
          { updatedAt: { gte: twentyFourHoursAgo } },
        ],
      },
      include: { template: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const items: Array<Omit<PanelItem, 'seq' | 'updatedAt'>> = [];

    for (const run of workflowRuns) {
      // steps는 JsonValue. 배열 여부 체크 후 narrowing
      const steps = Array.isArray(run.steps)
        ? (run.steps as Array<{ status?: string }>).map((s) => ({
            status: s?.status ?? 'pending',
          }))
        : [];

      items.push(
        workflowPanelAdapter.mapToItem(
          {
            id: run.id,
            status: run.status,
            templateName: run.template?.name ?? '',
            steps,
            parentRunId: null,
            triggeredByUserId: run.triggeredByUserId,
            createdAt: run.createdAt,
          },
          companyId,
        ),
      );
    }

    // ── Agent source (HeartbeatRun + AgentDefinition.name join) ──
    try {
      const heartbeatRuns = await this.prisma.heartbeatRun.findMany({
        where: {
          companyId,
          OR: [
            { status: { in: ['pending', 'running'] } },
            { updatedAt: { gte: twentyFourHoursAgo } },
          ],
        },
        include: { agent: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      for (const run of heartbeatRuns) {
        items.push(
          agentPanelAdapter.mapToItem(
            { run, agent: { id: run.agent.id, name: run.agent.name } },
            companyId,
          ),
        );
      }
    } catch (err) {
      this.logger.warn('Agent source backfill failed', err);
    }

    // ── Image source (ThumbnailGeneration + Product.title join) ──
    try {
      const thumbnailGens = await this.prisma.thumbnailGeneration.findMany({
        where: {
          companyId,
          OR: [
            { status: { in: ['pending', 'running'] } },
            { updatedAt: { gte: twentyFourHoursAgo } },
          ],
        },
        include: { master: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      for (const gen of thumbnailGens) {
        items.push(
          imagePanelAdapter.mapToItem(
            { generation: gen, product: { id: gen.master.id, title: gen.master.name } },
            companyId,
          ),
        );
      }
    } catch (err) {
      this.logger.warn('Image source backfill failed', err);
    }

    // ── Alert source (recent 24h alerts) ──
    try {
      const alerts = await this.prisma.alert.findMany({
        where: {
          companyId,
          createdAt: { gte: twentyFourHoursAgo },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      for (const alert of alerts) {
        items.push(alertPanelAdapter.mapToItem(alert));
      }
    } catch (err) {
      this.logger.warn('Alert source backfill failed', err);
    }

    // Visibility 필터: alert items are always company-visible (no visibility field).
    // run items: company OR (user AND actorUserId === currentUserId).
    // Note: Omit<union> doesn't distribute — cast to 'any' for discriminant narrowing.
    return items.filter((item) => {
      const i = item as any;
      if (i.kind === 'alert') return true; // alerts always company-wide
      return (
        i.visibility === 'company' ||
        (i.visibility === 'user' && i.actorUserId === currentUserId)
      );
    }) satisfies Array<Omit<PanelItem, 'seq' | 'updatedAt'>>;
  }

  /**
   * Backfill — 클라가 세 가지 상황에서 호출:
   *   (a) SSE 초기 연결
   *   (b) SSE 재접속 실패 후 polling fallback
   *   (c) Server 재시작 감지 후 리셋
   * PR1에선 snapshot과 동일 구현. seq는 클라가 서버 stream seq로 override.
   */
  async backfill(companyId: string, _afterSeq: number, currentUserId: string) {
    return this.snapshot(companyId, currentUserId);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import type { Alert } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { PanelItem } from '@kiditem/shared/panel';
import { workflowPanelMapper } from '../../../mapper/panel-event/workflow.mapper';
import { imagePanelMapper } from '../../../mapper/panel-event/image.mapper';
import { alertPanelMapper } from '../../../mapper/panel-event/alert.mapper';

@Injectable()
export class PanelService {
  private readonly logger = new Logger(PanelService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 현재 Panel에 표시되어야 할 아이템 전체.
   * - 진행 중 run (pending/running)
   * - 최근 24h terminal run
   * Sources: workflow run, thumbnail generation, alert.
   *
   * Agent run projection (formerly `HeartbeatRun + AgentDefinition`) was
   * removed in the Agent OS v2 migration. Live agent run events should be
   * emitted by Agent OS itself (`AgentRun.status` transitions on
   * `AgentRunCoordinator` / `AgentRunExecutor`) — that wiring is not yet
   * in place. Until it lands, the snapshot only contains the three
   * remaining sources. See
   * `automation/adapter/out/panel-event/AGENTS.md` "Not yet wired".
   */
  async snapshot(organizationId: string, currentUserId: string): Promise<Array<Omit<PanelItem, 'seq' | 'updatedAt'>>> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600 * 1000);

    const workflowRuns = await this.prisma.workflowRun.findMany({
      where: {
        organizationId,
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
    const alertRows: Alert[] = [];
    const alertBackedThumbnailGenerationIds = new Set<string>();

    for (const run of workflowRuns) {
      // steps는 JsonValue. 배열 여부 체크 후 narrowing
      const steps = Array.isArray(run.steps)
        ? (run.steps as Array<{ status?: string }>).map((s) => ({
            status: s?.status ?? 'pending',
          }))
        : [];

      items.push(
        workflowPanelMapper.mapToItem(
          {
            id: run.id,
            status: run.status,
            templateName: run.template?.name ?? '',
            steps,
            parentRunId: null,
            triggeredByUserId: run.triggeredByUserId,
            createdAt: run.createdAt,
          },
          organizationId,
        ),
      );
    }

    // ── Alert source ──
    // Recent (last 24h) alerts of any kind PLUS still-active operation
    // alerts regardless of age. `updatedAt` keeps a just-finished long-running
    // operation visible after reload even if it started outside the 24h window.
    try {
      const alerts = await this.prisma.alert.findMany({
        where: {
          organizationId,
          OR: [
            { createdAt: { gte: twentyFourHoursAgo } },
            { updatedAt: { gte: twentyFourHoursAgo } },
            {
              kind: 'operation',
              status: { in: ['pending', 'running'] },
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      for (const alert of alerts) {
        alertRows.push(alert);
        if (alert.sourceType === 'thumbnail_generation' && alert.sourceId) {
          alertBackedThumbnailGenerationIds.add(alert.sourceId);
        }
      }
    } catch (err) {
      this.logger.warn('Alert source backfill failed', err);
    }

    // ── Image source (ThumbnailGeneration + Product.title join) ──
    try {
      const thumbnailGens = await this.prisma.thumbnailGeneration.findMany({
        where: {
          organizationId,
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
        // Per-generation operation alerts are the user-facing work item for
        // thumbnail edit jobs. Keep the legacy image run projection only when
        // there is no matching alert in the current panel window.
        if (alertBackedThumbnailGenerationIds.has(gen.id)) continue;
        items.push(
          imagePanelMapper.mapToItem(
            { generation: gen, product: { id: gen.master.id, title: gen.master.name } },
            organizationId,
          ),
        );
      }
    } catch (err) {
      this.logger.warn('Image source backfill failed', err);
    }

    for (const alert of alertRows) {
      items.push(alertPanelMapper.mapToItem(alert));
    }

    // Visibility 필터: alert items are always organization-visible (no visibility field).
    // run items: organization OR (user AND actorUserId === currentUserId).
    // Note: Omit<union> doesn't distribute — cast to 'any' for discriminant narrowing.
    return items.filter((item) => {
      const i = item as any;
      if (i.kind === 'alert') return true; // alerts always organization-wide
      return (
        i.visibility === 'organization' ||
        (i.visibility === 'user' && i.actorUserId === currentUserId)
      );
    }) satisfies Array<Omit<PanelItem, 'seq' | 'updatedAt'>>;
  }

  /**
   * Backfill — 클라가 세 가지 상황에서 호출:
   *   (a) SSE 초기 연결
   *   (b) SSE 재접속 실패 후 polling fallback
   *   (c) Server 재시작 감지 후 리셋
   * Snapshot과 동일 구현. seq는 클라가 서버 stream seq로 override.
   */
  async backfill(organizationId: string, _afterSeq: number, currentUserId: string) {
    return this.snapshot(organizationId, currentUserId);
  }
}

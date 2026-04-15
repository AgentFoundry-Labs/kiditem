import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { PanelItem } from '@kiditem/shared';
import { workflowPanelAdapter } from './adapters/workflow.adapter';

@Injectable()
export class PanelService {
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

    // workflow-runner uses 'completed'; Panel enum uses 'succeeded' — normalize at boundary
    const normalizeStatus = (s: string | null | undefined) =>
      s === 'completed' ? 'succeeded' : (s ?? 'pending');

    for (const run of workflowRuns) {
      // steps는 JsonValue. 배열 여부 체크 후 narrowing
      const steps = Array.isArray(run.steps)
        ? (run.steps as Array<{ status?: string }>).map((s) => ({
            status: normalizeStatus(s?.status),
          }))
        : [];

      items.push(
        workflowPanelAdapter.mapToItem(
          {
            id: run.id,
            status: normalizeStatus(run.status),
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

    // Visibility 필터: company OR (user AND actorUserId === currentUserId)
    return items.filter(
      (item) =>
        item.visibility === 'company' ||
        (item.visibility === 'user' && item.actorUserId === currentUserId),
    );
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

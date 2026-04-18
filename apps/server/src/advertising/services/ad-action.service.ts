import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdActionTargetType } from './types';

const GENERATION_LOOKBACK_HOURS = 72;
const ACTION_DEDUP_HOURS = 24;

type ActionCandidate = {
  snapshotId: string;
  listingId: string | null;
  actionType: string;
  targetType: AdActionTargetType;
  externalId: string | null;
  targetLabel: string;
  reason: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  currentValue: number | null;
  proposedValue: number | null;
  payload: Record<string, unknown>;
};

export interface AdActionQuery {
  approvalStatus?: string;
  executeStatus?: string;
  listingId?: string;
  optionId?: string;
  targetType?: string;
  priority?: string;
  limit?: number;
}

@Injectable()
export class AdActionService {
  constructor(private readonly prisma: PrismaService) {}

  async getActions(query: AdActionQuery, companyId: string) {
    const limit = Math.min(query.limit || 50, 200);

    const where: Prisma.AdActionWhereInput = { companyId };
    if (query.approvalStatus && query.approvalStatus !== 'all') where.approvalStatus = query.approvalStatus;
    if (query.executeStatus && query.executeStatus !== 'all') where.executeStatus = query.executeStatus;
    if (query.listingId) where.listingId = query.listingId;
    if (query.targetType && query.targetType !== 'all') where.targetType = query.targetType;
    if (query.priority && query.priority !== 'all') where.priority = query.priority;

    const [items, counts, latestSnapshot] = await Promise.all([
      this.prisma.adAction.findMany({
        where,
        include: {
          listing: {
            select: {
              id: true,
              externalId: true,
              channelName: true,
              master: { select: { id: true, code: true, name: true, abcGrade: true, adTier: true } },
            },
          },
          snapshot: {
            select: {
              pageType: true,
              campaignName: true,
              keyword: true,
              productName: true,
              capturedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      Promise.all([
        this.prisma.adAction.count({ where: { companyId, approvalStatus: 'pending_review' } }),
        this.prisma.adAction.count({ where: { companyId, approvalStatus: 'approved', executeStatus: 'queued' } }),
        this.prisma.adAction.count({ where: { companyId, executeStatus: 'running' } }),
        this.prisma.adAction.count({ where: { companyId, executeStatus: 'done' } }),
        this.prisma.adAction.count({ where: { companyId, executeStatus: 'failed' } }),
      ]),
      this.prisma.adSnapshot.findFirst({
        where: { companyId },
        orderBy: { capturedAt: 'desc' },
        select: { capturedAt: true, pageType: true },
      }),
    ]);

    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    const sortedItems = [...items].sort((a, b) => {
      const priDiff =
        (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 9) -
        (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 9);
      if (priDiff !== 0) return priDiff;
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });

    return {
      items: sortedItems,
      summary: {
        pendingReview: counts[0],
        approvedQueued: counts[1],
        running: counts[2],
        done: counts[3],
        failed: counts[4],
        latestSnapshotAt: latestSnapshot?.capturedAt || null,
        latestSnapshotPageType: latestSnapshot?.pageType || null,
      },
    };
  }

  async generateActions(companyId: string) {
    const lookback = new Date(Date.now() - GENERATION_LOOKBACK_HOURS * 60 * 60 * 1000);
    const dedupCutoff = new Date(Date.now() - ACTION_DEDUP_HOURS * 60 * 60 * 1000);

    const [snapshots, existingActions] = await Promise.all([
      this.prisma.adSnapshot.findMany({
        where: {
          companyId,
          source: 'advertising',
          capturedAt: { gte: lookback },
          listingId: { not: null },
        },
        orderBy: { capturedAt: 'desc' },
        include: {
          listing: {
            select: {
              id: true,
              externalId: true,
              channelName: true,
              master: { select: { id: true, code: true, name: true, abcGrade: true, adTier: true } },
            },
          },
          option: {
            select: {
              id: true,
              sku: true,
              optionName: true,
              availableStock: true,
              costPrice: true,
              sellPrice: true,
              commissionRate: true,
            },
          },
        },
      }),
      this.prisma.adAction.findMany({
        where: {
          companyId,
          createdAt: { gte: dedupCutoff },
          approvalStatus: { in: ['pending_review', 'approved'] },
          executeStatus: { in: ['queued', 'running'] },
        },
        select: {
          actionType: true,
          externalId: true,
          targetLabel: true,
          currentValue: true,
          proposedValue: true,
        },
      }),
    ]);

    type SnapshotWithRelations = (typeof snapshots)[number];
    const latestByTarget = new Map<string, SnapshotWithRelations>();
    for (const snapshot of snapshots) {
      const key = buildSnapshotKey(snapshot);
      if (!latestByTarget.has(key)) latestByTarget.set(key, snapshot);
    }

    const dedupSet = new Set(
      existingActions.map((item) =>
        [item.actionType, item.externalId || '', item.targetLabel, item.currentValue ?? '', item.proposedValue ?? ''].join('::'),
      ),
    );

    const candidates: ActionCandidate[] = [];
    let skippedExisting = 0;

    for (const snapshot of latestByTarget.values()) {
      const candidate = createActionCandidate(snapshot);
      if (!candidate) continue;

      const dedupKey = [
        candidate.actionType,
        candidate.externalId || '',
        candidate.targetLabel,
        candidate.currentValue ?? '',
        candidate.proposedValue ?? '',
      ].join('::');

      if (dedupSet.has(dedupKey)) {
        skippedExisting++;
        continue;
      }

      dedupSet.add(dedupKey);
      candidates.push(candidate);
    }

    if (candidates.length === 0) {
      const targetCount = latestByTarget.size;
      const reason =
        snapshots.length === 0
          ? '광고 스냅샷이 아직 없습니다. 광고센터에서 익스텐션 동기화를 먼저 해주세요.'
          : targetCount === 0
            ? '추천 대상을 식별할 수 있는 광고 스냅샷이 없습니다. 캠페인/키워드 페이지에서 다시 동기화해주세요.'
            : '현재 규칙에 걸린 광고 액션이 없습니다. 최근 스냅샷 기준으로는 즉시 조정할 항목이 없습니다.';

      return {
        generated: 0,
        skippedExisting,
        items: [],
        reason,
        stats: { snapshotCount: snapshots.length, targetCount },
      };
    }

    const created = await this.prisma.$transaction(
      candidates.map((c) =>
        this.prisma.adAction.create({
          data: {
            companyId,
            listingId: c.listingId,
            snapshotId: c.snapshotId,
            actionType: c.actionType,
            targetType: c.targetType,
            externalId: c.externalId,
            targetLabel: c.targetLabel,
            reason: c.reason,
            priority: c.priority,
            currentValue: c.currentValue,
            proposedValue: c.proposedValue,
            payload: c.payload as Prisma.InputJsonValue,
          },
        }),
      ),
    );

    return {
      generated: created.length,
      skippedExisting,
      items: created.slice(0, 10),
      reason: `${created.length}개의 광고 액션을 생성했습니다.`,
      stats: { snapshotCount: snapshots.length, targetCount: latestByTarget.size },
    };
  }

  async approveActions(ids: string[], companyId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.adAction.updateMany({
        where: { id: { in: ids }, companyId },
        data: { approvalStatus: 'approved', approvedAt: new Date(), executeStatus: 'queued' },
      });

      const scopedActions = await tx.adAction.findMany({
        where: { id: { in: ids }, companyId },
        select: { id: true },
      });
      const scopedIds = scopedActions.map((a) => a.id);

      const existingOpenTasks = await tx.executionTask.findMany({
        where: { actionId: { in: scopedIds }, status: { in: ['queued', 'leased', 'running'] } },
        select: { actionId: true },
      });
      const existingSet = new Set(existingOpenTasks.map((t) => t.actionId));

      const toCreate = scopedIds
        .filter((id) => !existingSet.has(id))
        .map((id) => ({ actionId: id, status: 'queued' }));

      if (toCreate.length > 0) {
        await tx.executionTask.createMany({ data: toCreate });
      }
    });

    return { updated: ids.length };
  }

  async rejectActions(ids: string[], companyId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.adAction.updateMany({
        where: { id: { in: ids }, companyId },
        data: { approvalStatus: 'rejected', executeStatus: 'queued' },
      });

      const scopedActions = await tx.adAction.findMany({
        where: { id: { in: ids }, companyId },
        select: { id: true },
      });
      const scopedIds = scopedActions.map((a) => a.id);

      await tx.executionTask.updateMany({
        where: { actionId: { in: scopedIds }, status: { in: ['queued', 'leased'] } },
        data: { status: 'cancelled', finishedAt: new Date(), errorMessage: '사용자 보류 처리' },
      });
    });

    return { updated: ids.length };
  }

  async markRunning(id: string, beforeJson: Record<string, unknown> | undefined, companyId: string) {
    const action = await this.prisma.adAction.findFirst({ where: { id, companyId } });
    if (!action) throw new NotFoundException('AdAction not found');

    await this.prisma.adAction.update({
      where: { id },
      data: {
        executeStatus: 'running',
        beforeJson: beforeJson ? (beforeJson as Prisma.InputJsonValue) : undefined,
        errorMessage: null,
      },
    });
  }

  async markDone(id: string, afterJson: Record<string, unknown> | undefined, companyId: string) {
    const action = await this.prisma.adAction.findFirst({ where: { id, companyId } });
    if (!action) throw new NotFoundException('AdAction not found');

    await this.prisma.adAction.update({
      where: { id },
      data: {
        executeStatus: 'done',
        executedAt: new Date(),
        afterJson: afterJson ? (afterJson as Prisma.InputJsonValue) : undefined,
        errorMessage: null,
      },
    });
  }

  async markFailed(
    id: string,
    errorMessage: string | undefined,
    afterJson: Record<string, unknown> | undefined,
    companyId: string,
  ) {
    const action = await this.prisma.adAction.findFirst({ where: { id, companyId } });
    if (!action) throw new NotFoundException('AdAction not found');

    await this.prisma.adAction.update({
      where: { id },
      data: {
        executeStatus: 'failed',
        errorMessage: errorMessage || '실행 실패',
        afterJson: afterJson ? (afterJson as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async resetFailed(companyId: string) {
    await this.prisma.$transaction(async (tx) => {
      const failedActions = await tx.adAction.findMany({
        where: { companyId, executeStatus: 'failed', approvalStatus: 'approved' },
        select: { id: true },
      });

      if (failedActions.length === 0) return;
      const ids = failedActions.map((a) => a.id);

      await tx.adAction.updateMany({
        where: { id: { in: ids }, companyId },
        data: { executeStatus: 'queued', errorMessage: null },
      });

      await tx.executionTask.createMany({
        data: ids.map((id) => ({ actionId: id, status: 'queued' })),
      });
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSnapshotKey(snapshot: {
  pageType: string;
  externalId: string | null;
  campaignName: string | null;
  keyword: string | null;
  productName: string | null;
}) {
  return snapshot.externalId || [snapshot.pageType, snapshot.campaignName, snapshot.keyword, snapshot.productName].join('::');
}

function createActionCandidate(snapshot: {
  id: string;
  listingId: string | null;
  pageType: string;
  externalId: string | null;
  campaignName: string | null;
  keyword: string | null;
  productName: string | null;
  status: string | null;
  currentBid: number | null;
  dailyBudget: number | null;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  revenue: number;
  roas: unknown;
  ctr: unknown;
  listing: {
    id: string;
    externalId: string;
    channelName: string | null;
    master: { id: string; code: string; name: string; abcGrade: string | null; adTier: string | null } | null;
  } | null;
  option: {
    id: string;
    sku: string;
    optionName: string | null;
    availableStock: number | null;
    costPrice: number | null;
    sellPrice: number | null;
    commissionRate: Prisma.Decimal | null;
  } | null;
  [key: string]: unknown;
}): ActionCandidate | null {
  const grade = snapshot.listing?.master?.abcGrade || 'C';
  const roas = Number(snapshot.roas ?? 0);
  const profitRateNum = calcProfitRate(snapshot.option);
  const targetLabel = snapshot.keyword || snapshot.campaignName || snapshot.productName || snapshot.externalId || '미식별 대상';
  const statusText = (snapshot.status || '').toLowerCase();

  // Rule 1: zero stock → budget cut (option null 이면 Rule 1 skip)
  if (snapshot.option && snapshot.option.availableStock === 0 && snapshot.pageType === 'campaign' && snapshot.dailyBudget && snapshot.dailyBudget > 0) {
    return {
      snapshotId: snapshot.id,
      listingId: snapshot.listingId,
      actionType: 'change_daily_budget',
      targetType: 'campaign',
      externalId: snapshot.externalId,
      targetLabel,
      reason: `재고 0개인데 광고 예산 ${formatNumber(snapshot.dailyBudget)}원이 유지 중입니다. 즉시 축소가 필요합니다.`,
      priority: 'urgent',
      currentValue: snapshot.dailyBudget,
      proposedValue: 3000,
      payload: basePayload(snapshot, { pageType: 'campaign' }),
    };
  }

  // Rule 2 & 3: keyword pause / bid change
  if (snapshot.pageType === 'keyword') {
    const zeroConversionSpend = snapshot.conversions === 0 && snapshot.spend >= 5000;
    const poorRoas = roas > 0 && roas < 100;

    if (!isPaused(statusText) && (zeroConversionSpend || poorRoas)) {
      return {
        snapshotId: snapshot.id,
        listingId: snapshot.listingId,
        actionType: 'pause_keyword',
        targetType: 'keyword',
        externalId: snapshot.externalId,
        targetLabel,
        reason: zeroConversionSpend
          ? `전환 0건인데 광고비 ${formatNumber(snapshot.spend)}원이 누적되었습니다. 즉시 OFF 권장.`
          : `ROAS ${Math.round(roas)}%로 기준 미달입니다. 키워드 OFF 후 재검토가 필요합니다.`,
        priority: grade === 'A' ? 'high' : 'urgent',
        currentValue: null,
        proposedValue: null,
        payload: basePayload(snapshot, { pageType: 'keyword' }),
      };
    }

    if (snapshot.currentBid && snapshot.currentBid > 0 && roas >= 100 && roas < 200) {
      const nextBid = roundBid(snapshot.currentBid * 0.85);
      if (nextBid < snapshot.currentBid) {
        return {
          snapshotId: snapshot.id,
          listingId: snapshot.listingId,
          actionType: 'change_bid',
          targetType: 'keyword',
          externalId: snapshot.externalId,
          targetLabel,
          reason: `ROAS ${Math.round(roas)}%로 입찰가 하향 구간입니다. 현재 ${formatNumber(snapshot.currentBid)}원 → ${formatNumber(nextBid)}원.`,
          priority: profitRateNum !== null && profitRateNum < 0 ? 'high' : 'medium',
          currentValue: snapshot.currentBid,
          proposedValue: nextBid,
          payload: basePayload(snapshot, { pageType: 'keyword' }),
        };
      }
    }
  }

  // Rule 4 & 5: campaign budget increase / decrease
  if (snapshot.pageType === 'campaign' && snapshot.dailyBudget && snapshot.dailyBudget > 0) {
    if (grade === 'A' && roas >= 480) {
      const nextBudget = roundBudget(snapshot.dailyBudget * 1.2);
      if (nextBudget > snapshot.dailyBudget) {
        return {
          snapshotId: snapshot.id,
          listingId: snapshot.listingId,
          actionType: 'change_daily_budget',
          targetType: 'campaign',
          externalId: snapshot.externalId,
          targetLabel,
          reason: `A등급 / ROAS ${Math.round(roas)}%로 예산 확대 구간입니다. 현재 ${formatNumber(snapshot.dailyBudget)}원 → ${formatNumber(nextBudget)}원.`,
          priority: 'high',
          currentValue: snapshot.dailyBudget,
          proposedValue: nextBudget,
          payload: basePayload(snapshot, { pageType: 'campaign' }),
        };
      }
    }

    if ((grade === 'C' || roas < 100) && snapshot.dailyBudget > 3000) {
      const nextBudget = Math.max(3000, roundBudget(snapshot.dailyBudget * 0.5));
      if (nextBudget < snapshot.dailyBudget) {
        return {
          snapshotId: snapshot.id,
          listingId: snapshot.listingId,
          actionType: 'change_daily_budget',
          targetType: 'campaign',
          externalId: snapshot.externalId,
          targetLabel,
          reason: `${grade}등급 / ROAS ${Math.round(roas)}%로 예산 축소 구간입니다. 현재 ${formatNumber(snapshot.dailyBudget)}원 → ${formatNumber(nextBudget)}원.`,
          priority: grade === 'C' ? 'high' : 'medium',
          currentValue: snapshot.dailyBudget,
          proposedValue: nextBudget,
          payload: basePayload(snapshot, { pageType: 'campaign' }),
        };
      }
    }
  }

  return null;
}

function calcProfitRate(option: {
  costPrice: number | null;
  sellPrice: number | null;
  commissionRate: Prisma.Decimal | null;
} | null): number | null {
  if (!option) return null;
  const cost = option.costPrice ?? 0;
  const sell = option.sellPrice ?? 0;
  if (sell <= 0) return null;
  const commission = option.commissionRate != null ? Number(option.commissionRate) : 0;
  const commissionFee = sell * commission;
  const profit = sell - cost - commissionFee;
  return Math.round((profit / sell) * 10000) / 100;
}

function basePayload(
  snapshot: {
    pageType: string;
    campaignName: string | null;
    keyword: string | null;
    productName: string | null;
    externalId: string | null;
    status: string | null;
  },
  extras: Record<string, unknown>,
) {
  return {
    pageType: snapshot.pageType,
    campaignName: snapshot.campaignName,
    keyword: snapshot.keyword,
    productName: snapshot.productName,
    externalId: snapshot.externalId,
    status: snapshot.status,
    ...extras,
  };
}

function roundBudget(value: number) {
  return Math.max(3000, Math.round(value / 100) * 100);
}

function roundBid(value: number) {
  return Math.max(100, Math.round(value / 10) * 10);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR').format(Math.round(value));
}

function isPaused(statusText: string) {
  return ['off', '중지', '일시중지', '비활성', 'pause'].some((token) => statusText.includes(token));
}

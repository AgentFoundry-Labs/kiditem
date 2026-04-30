import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  findAdActionsForReview,
  findLatestAdActionTargetRows,
  findLatestListingOptionStockById,
  type AdActionQuery,
} from '../../adapter/out/prisma/ad-action.query';
import {
  createActionCandidate,
  type ActionCandidate,
} from '../../domain/ad-action-rules';
import {
  approveAdActions,
  createAdActionsFromCandidates,
  rejectAdActions,
  resetFailedAdActions,
  updateActionOrThrow,
} from '../../adapter/out/prisma/ad-action.persistence';

const ACTION_DEDUP_HOURS = 24;

/**
 * Application orchestration for `AdAction` lifecycle. The service:
 *
 * - reads the latest target-daily rows + option-stock map (read-models),
 * - feeds each row to the pure 5-rule selector (`domain/ad-action-rules`),
 * - dedupes against in-flight rows the same company already has open, and
 * - hands the resulting candidates / state transitions to the
 *   tenant-scoped persistence helpers.
 *
 * Tenant scoping (`companyId`) is enforced by the persistence layer; this
 * service supplies it from the controller's `@CurrentCompany()`.
 */
@Injectable()
export class AdActionService {
  constructor(private readonly prisma: PrismaService) {}

  async getActions(query: AdActionQuery, companyId: string) {
    return findAdActionsForReview(this.prisma, query, companyId);
  }

  /**
   * Generate `AdAction` rows from `ChannelAdTargetDailySnapshot`.
   *
   * Rules apply to one latest-businessDate row per `targetKey`. Rule 1 (zero
   * stock) needs option stock — when `listingOptionId` is set we fetch the
   * latest `ChannelListingOptionDailySnapshot.stockQty`, and when absent we
   * skip Rule 1.
   *
   * Each created `AdAction` carries `adTargetDailyId` pointing at the source
   * target-daily row for audit/replay.
   */
  async generateActions(companyId: string) {
    const dedupCutoff = new Date(
      Date.now() - ACTION_DEDUP_HOURS * 60 * 60 * 1000,
    );

    const latestRows = await findLatestAdActionTargetRows(this.prisma, companyId);

    // Rule 1 stock-zero check: prefer the latest option daily snapshot's
    // stockQty when listingOptionId is set. Legacy used the live
    // `ProductOption.availableStock`; the daily-fact replacement gives the
    // observed channel stock at the same time the ad metric was captured.
    // Either signal === 0 fires the rule.
    const listingOptionIds = Array.from(
      new Set(
        latestRows
          .map((r) => r.listingOptionId)
          .filter((id): id is string => id != null),
      ),
    );
    const optionDailyStockMap = await findLatestListingOptionStockById(
      this.prisma,
      companyId,
      listingOptionIds,
    );

    const existingActions = await this.prisma.adAction.findMany({
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
    });

    const dedupSet = new Set(
      existingActions.map((item) =>
        [item.actionType, item.externalId || '', item.targetLabel, item.currentValue ?? '', item.proposedValue ?? ''].join('::'),
      ),
    );

    const candidates: ActionCandidate[] = [];
    let skippedExisting = 0;

    for (const row of latestRows) {
      const candidate = createActionCandidate(row, optionDailyStockMap);
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
      const targetCount = latestRows.length;
      const reason =
        latestRows.length === 0
          ? '광고 일별 fact 가 아직 없습니다. 광고센터에서 익스텐션 동기화를 먼저 해주세요.'
          : '현재 규칙에 걸린 광고 액션이 없습니다. 최근 일별 fact 기준으로는 즉시 조정할 항목이 없습니다.';

      return {
        generated: 0,
        skippedExisting,
        items: [],
        reason,
        stats: { snapshotCount: latestRows.length, targetCount },
      };
    }

    const created = await createAdActionsFromCandidates(
      this.prisma,
      companyId,
      candidates,
    );

    return {
      generated: created.length,
      skippedExisting,
      items: created.slice(0, 10),
      reason: `${created.length}개의 광고 액션을 생성했습니다.`,
      stats: { snapshotCount: latestRows.length, targetCount: latestRows.length },
    };
  }

  async approveActions(ids: string[], companyId: string) {
    await this.prisma.$transaction((tx) => approveAdActions(tx, ids, companyId));
    return { updated: ids.length };
  }

  async rejectActions(ids: string[], companyId: string) {
    await this.prisma.$transaction((tx) => rejectAdActions(tx, ids, companyId));
    return { updated: ids.length };
  }

  async markRunning(id: string, beforeJson: Record<string, unknown> | undefined, companyId: string) {
    await updateActionOrThrow(this.prisma, id, companyId, {
      executeStatus: 'running',
      beforeJson: beforeJson ? (beforeJson as Prisma.InputJsonValue) : undefined,
      errorMessage: null,
    });
  }

  async markDone(id: string, afterJson: Record<string, unknown> | undefined, companyId: string) {
    await updateActionOrThrow(this.prisma, id, companyId, {
      executeStatus: 'done',
      executedAt: new Date(),
      afterJson: afterJson ? (afterJson as Prisma.InputJsonValue) : undefined,
      errorMessage: null,
    });
  }

  async markFailed(
    id: string,
    errorMessage: string | undefined,
    afterJson: Record<string, unknown> | undefined,
    companyId: string,
  ) {
    await updateActionOrThrow(this.prisma, id, companyId, {
      executeStatus: 'failed',
      errorMessage: errorMessage || '실행 실패',
      afterJson: afterJson ? (afterJson as Prisma.InputJsonValue) : undefined,
    });
  }

  async resetFailed(companyId: string) {
    await this.prisma.$transaction((tx) => resetFailedAdActions(tx, companyId));
  }
}

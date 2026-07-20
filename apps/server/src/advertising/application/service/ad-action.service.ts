import { Inject, Injectable } from '@nestjs/common';
import {
  AD_ACTION_REPOSITORY_PORT,
  type AdActionQuery,
  type AdActionRepositoryPort,
} from '../port/out/repository/ad-action.repository.port';
import {
  createActionCandidate,
  type ActionCandidate,
  type ChannelSkuAdEvidence,
} from '../../domain/ad-action-rules';
import { computeChannelSkuPurchaseCost } from '../../domain/strategy-context';
import {
  CHANNEL_SKU_AVAILABILITY_PORT,
  type ChannelSkuAvailabilityPort,
} from '../../../channels/application/port/in/channel-sku-availability.port';

const ACTION_DEDUP_HOURS = 24;

/**
 * Application orchestration for `AdAction` lifecycle. The service:
 *
 * - reads the latest target-daily rows + canonical ChannelSku availability,
 * - feeds each row to the pure 5-rule selector (`domain/ad-action-rules`),
 * - dedupes against in-flight rows the same organization already has open, and
 * - hands the resulting candidates / state transitions to the
 *   tenant-scoped persistence helpers.
 *
 * Tenant scoping (`organizationId`) is enforced by the persistence layer; this
 * service supplies it from the controller's `@CurrentOrganization()`.
 */
@Injectable()
export class AdActionService {
  constructor(
    @Inject(AD_ACTION_REPOSITORY_PORT)
    private readonly repo: AdActionRepositoryPort,
    @Inject(CHANNEL_SKU_AVAILABILITY_PORT)
    private readonly channelSkuAvailability: ChannelSkuAvailabilityPort,
  ) {}

  async getActions(query: AdActionQuery, organizationId: string) {
    return this.repo.findAdActionsForReview(query, organizationId);
  }

  /**
   * Generate `AdAction` rows from `ChannelAdTargetDailySnapshot`.
   *
   * Rules apply to one latest-businessDate row per `targetKey`. Rule 1 (zero
   * stock) uses the exact confirmed ChannelSku component recipe. An unmapped
   * SKU yields `sellableStock = null` and does not trigger the zero-stock rule.
   *
   * Each created `AdAction` carries `adTargetDailyId` pointing at the source
   * target-daily row for audit/replay.
   */
  async generateActions(organizationId: string) {
    const dedupCutoff = new Date(
      Date.now() - ACTION_DEDUP_HOURS * 60 * 60 * 1000,
    );

    const latestRows = await this.repo.findLatestTargetRows(organizationId);

    const listingOptionIds = Array.from(
      new Set(
        latestRows
          .map((r) => r.listingOptionId)
          .filter((id): id is string => id != null),
      ),
    );
    const availability = await this.channelSkuAvailability.findByChannelSkuIds(
      organizationId,
      listingOptionIds,
    );
    const channelSkuEvidenceMap = new Map<string, ChannelSkuAdEvidence>(
      availability.map((item) => [item.sku.id, {
        sellableStock: item.sku.sellableStock,
        purchaseCost: computeChannelSkuPurchaseCost(item.components),
        salePrice: item.sku.salePrice,
      }]),
    );

    const existingActions = await this.repo.findExistingInflightActions(
      organizationId,
      dedupCutoff,
    );

    const dedupSet = new Set(
      existingActions.map((item) =>
        [item.actionType, item.externalId || '', item.targetLabel, item.currentValue ?? '', item.proposedValue ?? ''].join('::'),
      ),
    );

    const candidates: ActionCandidate[] = [];
    let skippedExisting = 0;

    for (const row of latestRows) {
      const candidate = createActionCandidate(row, channelSkuEvidenceMap);
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

    const created = await this.repo.createAdActionsFromCandidates(
      organizationId,
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

  async approveActions(ids: string[], organizationId: string) {
    await this.repo.approveAdActions(ids, organizationId);
    return { updated: ids.length };
  }

  async rejectActions(ids: string[], organizationId: string) {
    await this.repo.rejectAdActions(ids, organizationId);
    return { updated: ids.length };
  }

  async markRunning(id: string, beforeJson: Record<string, unknown> | undefined, organizationId: string) {
    await this.repo.updateActionOrThrow(id, organizationId, {
      executeStatus: 'running',
      beforeJson: beforeJson,
      errorMessage: null,
    });
  }

  async markDone(id: string, afterJson: Record<string, unknown> | undefined, organizationId: string) {
    await this.repo.updateActionOrThrow(id, organizationId, {
      executeStatus: 'done',
      executedAt: new Date(),
      afterJson: afterJson,
      errorMessage: null,
    });
  }

  async markFailed(
    id: string,
    errorMessage: string | undefined,
    afterJson: Record<string, unknown> | undefined,
    organizationId: string,
  ) {
    await this.repo.updateActionOrThrow(id, organizationId, {
      executeStatus: 'failed',
      errorMessage: errorMessage || '실행 실패',
      afterJson: afterJson,
    });
  }

  async resetFailed(organizationId: string) {
    await this.repo.resetFailedAdActions(organizationId);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import {
  AD_ACTION_REPOSITORY_PORT,
  type AdActionQuery,
  type AdActionRepositoryPort,
  type AdActionReviewOptions,
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
import type { AdActionCommandResult } from '@kiditem/shared/advertising';

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
 *
 * Execution state lives on the action's latest ExecutionTask. The browser
 * extension's markRunning / markDone / markFailed reports name the attempt
 * they report for and move only that task while it is the latest; a second
 * markRunning for a running task is another executor and is refused.
 * Approving a failed action queues a new one. A running attempt past its
 * execution deadline reads failed; approving again or a late report closes it.
 * Rejecting cancels a queued attempt. It is refused while an attempt runs
 * within its deadline, since that executor may already be changing Coupang,
 * and once the latest attempt is done, since Coupang already changed.
 *
 * Keyword pauses, bid changes and daily budget changes are applied by hand in
 * the ad center (`MANUAL_AD_ACTION_TYPES`, KID-138 decision A). Approving one
 * records a failed attempt that says so instead of queuing it, and the
 * extension's running or done report for one is refused.
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

  /**
   * `updated` is how many distinct actions of the organization changed; a
   * repeated id, another organization's action, an unknown id, or an action no
   * longer in the review `options` expects adds nothing.
   */
  async approveActions(
    ids: string[],
    organizationId: string,
    options: AdActionReviewOptions = {},
  ) {
    return {
      updated: await this.repo.approveAdActions(ids, organizationId, options),
    } satisfies AdActionCommandResult;
  }

  async rejectActions(
    ids: string[],
    organizationId: string,
    options: AdActionReviewOptions = {},
  ) {
    return {
      updated: await this.repo.rejectAdActions(ids, organizationId, options),
    } satisfies AdActionCommandResult;
  }

  async markRunning(
    id: string,
    executionTaskId: string,
    beforeJson: Record<string, unknown> | undefined,
    organizationId: string,
  ) {
    await this.repo.reportActionExecution(id, organizationId, {
      executionTaskId,
      status: 'running',
      beforeJson,
    });
  }

  async markDone(
    id: string,
    executionTaskId: string,
    afterJson: Record<string, unknown> | undefined,
    organizationId: string,
  ) {
    await this.repo.reportActionExecution(id, organizationId, {
      executionTaskId,
      status: 'done',
      afterJson,
    });
  }

  async markFailed(
    id: string,
    executionTaskId: string,
    errorMessage: string | undefined,
    afterJson: Record<string, unknown> | undefined,
    organizationId: string,
  ) {
    await this.repo.reportActionExecution(id, organizationId, {
      executionTaskId,
      status: 'failed',
      errorMessage: errorMessage || '실행 실패',
      afterJson,
    });
  }
}

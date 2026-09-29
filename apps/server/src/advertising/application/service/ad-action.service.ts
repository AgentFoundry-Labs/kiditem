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
import {
  CHANNEL_SKU_AVAILABILITY_PORT,
  type ChannelSkuAvailabilityPort,
} from '../../../channels/application/port/in/channel-sku-availability.port';
import type { AdActionCommandResult } from '@kiditem/shared/advertising';

const ACTION_DEDUP_HOURS = 24;

/**
 * Application orchestration for `AdAction` lifecycle. The service:
 *
 * - reads the campaign and keyword rule targets of the ad report ledger +
 *   canonical ChannelSku availability,
 * - feeds each target to the pure rule selector (`domain/ad-action-rules`),
 * - dedupes against in-flight rows the same organization already has open, and
 * - hands the resulting candidates / state transitions to the
 *   tenant-scoped persistence helpers.
 *
 * Tenant scoping (`organizationId`) is enforced by the persistence layer; this
 * service supplies it from the controller's `@CurrentOrganization()`.
 *
 * Approving a create_campaign prepares its `advertising.ad_action` run; the
 * browser extension claims it and reports through the operation contract's
 * finish (KID-386).
 *
 * Keyword pauses, bid changes and daily budget changes are applied by hand in
 * the ad center (`MANUAL_AD_ACTION_TYPES`, KID-138 decision A). Approving one
 * records the operator's confirmation and prepares nothing.
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
   * Generate `AdAction` rows from the ad report ledger (KID-372).
   *
   * Rules apply to each current campaign and search keyword over the recent
   * measured window. The zero-stock rule uses the exact confirmed ChannelSku
   * component recipe of the advertised options; an unmapped SKU yields
   * `sellableStock = null` and does not trigger it.
   *
   * Each created `AdAction` carries the ad report evidence it was judged on in
   * `payload.adTarget` (campaign, ad group, option, keyword, last measured day).
   */
  async generateActions(organizationId: string) {
    const dedupCutoff = new Date(
      Date.now() - ACTION_DEDUP_HOURS * 60 * 60 * 1000,
    );

    const targets = await this.repo.findRuleTargets(organizationId);
    // A keyword paused from this window's evidence keeps its pre-pause clicks
    // in the window, so it is not proposed again until the window moves past it.
    const windowStartDate = targets[0]?.windowStartDate;
    const appliedPauses = windowStartDate
      ? new Set((await this.repo.findAppliedKeywordPauses(organizationId, windowStartDate))
        .map((pause) => `${pause.externalId ?? ''}::${pause.targetLabel}`))
      : new Set<string>();
    const latestRows = targets.filter((row) =>
      row.targetType !== 'keyword' || !appliedPauses.has(`${row.vendorItemId ?? ''}::${row.keyword ?? ''}`));

    const listingIds = [...new Set(latestRows.flatMap((row) => row.listingIds))];
    const availability = listingIds.length > 0
      ? await this.channelSkuAvailability.findByListingIds(organizationId, listingIds)
      : [];
    // Keyed by advertised option: a ChannelSku's external id is the Coupang vendorItemId.
    const channelSkuEvidenceMap = new Map<string, ChannelSkuAdEvidence>(
      availability.map((item) => [item.sku.externalSkuId, { sellableStock: item.sku.sellableStock }]),
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
          ? '측정한 광고 보고서가 아직 없습니다. 광고 보고서 수집을 먼저 실행해 주세요.'
          : '현재 규칙에 걸린 광고 액션이 없습니다. 최근 측정한 광고 보고서 기준으로는 즉시 조정할 항목이 없습니다.';

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
}

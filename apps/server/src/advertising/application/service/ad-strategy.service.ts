import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KiditemConflictError, KiditemInvalidValueError, KiditemPreconditionError } from '@kiditem/shared/errors';
import { adActionCreateCampaign } from '../../domain/ad-action-operation';
import { AdConfigService } from './ad-config.service';
import { AdGradeRulesService } from './ad-grade-rules.service';
import { AdBudgetAllocatorService } from './ad-budget-allocator.service';
import { AdRecommendService } from './ad-recommend.service';
import type { RegisterCampaignDto } from '../../adapter/in/http/dto/register-campaign.dto';
import {
  applyChannelSkuAvailability,
  getProfitRateWindow,
  getWeekRange,
  toGradeMapStrict,
} from '../../domain/strategy-context';
import {
  AD_STRATEGY_CONTEXT_REPOSITORY_PORT,
  type AdStrategyContextRepositoryPort,
} from '../port/out/repository/ad-strategy-context.repository.port';
import {
  AD_LISTING_REPOSITORY_PORT,
  type AdListingRepositoryPort,
} from '../port/out/repository/ad-listing.repository.port';
import {
  AD_ACTION_REPOSITORY_PORT,
  type AdActionRepositoryPort,
} from '../port/out/repository/ad-action.repository.port';
import {
  toAdRulesData,
  toRecommendationCards,
} from '../../domain/ad-strategy.mapper';
import type {
  AdCampaignRegisterResponse,
  AdRulesData,
  AdStrategyAction,
  AdStrategyRecommendation,
  AdWeeklyPlan,
} from '@kiditem/shared/advertising';
import {
  CHANNEL_SKU_AVAILABILITY_PORT,
  type ChannelSkuAvailabilityPort,
} from '../../../channels/application/port/in/channel-sku-availability.port';

type Priority = 'urgent' | 'high' | 'medium' | 'low';

/**
 * Endpoint orchestration for `/api/ads/strategy/*` and `/api/ads/campaigns/register`.
 *
 * Heavy lifting (raw SQL latest-state reads, multi-step hydration, pure rule
 * evaluation, mapping) lives in `domain/`, `adapter/out/repository/`, `mapper/`,
 * and the three sub-service calculators (`AdGradeRulesService`,
 * `AdBudgetAllocatorService`, `AdRecommendService`).
 *
 * This service only:
 *   - composes the per-endpoint Promise.all batches,
 *   - delegates calculation to the sub-services,
 *   - assembles response shapes via mappers,
 *   - and writes for `registerCampaign()` (kept here because of its IDOR +
 *     duplicate-guard + ExecutionTask creation contract).
 */
@Injectable()
export class AdStrategyService {
  constructor(
    @Inject(AD_STRATEGY_CONTEXT_REPOSITORY_PORT)
    private readonly strategyContextRepo: AdStrategyContextRepositoryPort,
    @Inject(AD_LISTING_REPOSITORY_PORT)
    private readonly listingRepo: AdListingRepositoryPort,
    @Inject(AD_ACTION_REPOSITORY_PORT)
    private readonly actionRepo: AdActionRepositoryPort,
    private readonly adConfigService: AdConfigService,
    private readonly adGradeRules: AdGradeRulesService,
    private readonly adBudgetAllocator: AdBudgetAllocatorService,
    private readonly adRecommend: AdRecommendService,
    @Inject(CHANNEL_SKU_AVAILABILITY_PORT)
    private readonly channelSkuAvailability: ChannelSkuAvailabilityPort,
  ) {}

  // ───── PUBLIC API (5 endpoints) ─────

  /** ABC 등급 규칙 기반 recommendations + 요약. */
  async getRules(
    period: '7d' | '14d' | 'month',
    organizationId: string,
  ): Promise<AdRulesData> {
    const recommendations = await this.buildActions(organizationId, period);
    return toAdRulesData(recommendations);
  }

  /** 주간 액션 플랜 — strategy context 한 번 hydrate 후 sub-service 조립. */
  async getWeeklyPlan(
    period: '7d' | '14d' | 'month',
    organizationId: string,
  ): Promise<AdWeeklyPlan> {
    const config = await this.adConfigService.getConfig(organizationId);
    const ctx = await this.strategyContextRepo.loadStrategyContext(
      organizationId,
      getProfitRateWindow(),
      period,
      config,
    );
    const listings = await this.loadExactAvailability(
      organizationId,
      ctx.listings,
    );

    // calcBudgetAllocation 은 AdWeeklyPlan shape 에 노출되진 않지만
    // adConfig.getConfig 부작용 (seed) 보존을 위해 호출해 둔다.
    this.adBudgetAllocator.calcBudgetAllocation({
      config: ctx.config,
      adGroups: ctx.adGroups,
      listings,
      gradeMap: toGradeMapStrict(ctx.gradeMap),
    });

    const top20 = this.adBudgetAllocator.calcTop20({
      listings,
      adGroups: ctx.adGroups,
      trafficByListing: ctx.trafficByListing,
    });

    return {
      actions: this.adGradeRules.calcActions({
        adGroups: ctx.adGroups,
        listings,
        gradeMap: ctx.gradeMap,
        profitRateByListing: ctx.profitRateByListing,
        channelStateByListing: ctx.channelStateByListing,
      }),
      issues: this.adGradeRules.calcAdIssues({
        adGroups: ctx.adIssuesAdGroups,
        listings,
        gradeMap: ctx.gradeMap,
      }),
      top20,
      week: getWeekRange(period),
      profitWithheldListings: ctx.profitWithheldListings,
      orderWindowComplete: ctx.orderWindowComplete,
    } satisfies AdWeeklyPlan;
  }

  /** AI agent 로 보강한 주간 플랜. agent 미정의/실패 시 원본 그대로 (graceful). */
  async getAiEnhancedPlan(
    period: '7d' | '14d' | 'month',
    organizationId: string,
  ): Promise<AdWeeklyPlan> {
    const plan = await this.getWeeklyPlan(period, organizationId);
    const enhancedActions = await this.adRecommend.enhanceActionsWithAi(
      plan.actions,
      organizationId,
    );
    return { ...plan, actions: enhancedActions } satisfies AdWeeklyPlan;
  }

  /**
   * urgent/high 만 필터 → 상위 20 → recommendation 카드. 계산기 기반 —
   * agent task 의존 없음 (B2b 복원).
   */
  async getRecommendations(organizationId: string): Promise<AdStrategyRecommendation[]> {
    const actions = await this.buildActions(organizationId, '14d');
    return toRecommendationCards(actions);
  }

  /**
   * 캠페인 등록 — listing IDOR guard + 한 계정 확인 + 중복 차단 + 승인된 AdAction 생성 + 실행 준비(KID-386).
   *
   * 등록 내용은 액션 `payload`에 둔다: 광고센터 등록 폼이 쓰는 `campaignName`·`adGroupName`·`productIds`(리스팅의
   * 외부 id = 광고센터 상품 검색 키)·`dailyBudget`·`targetRoas`와 화면이 보낸 나머지 값. 계정은 `channelAccountId`
   * 칸이다. 액션을 커밋한 뒤 `advertising.ad_action` 실행을 준비하고, 준비가 실패하면 그 오류를 올린다(액션은
   * 승인·`not_prepared`로 남고 다시 승인하면 준비된다).
   */
  async registerCampaign(
    dto: RegisterCampaignDto,
    organizationId: string,
  ): Promise<AdCampaignRegisterResponse> {
    // 1. listingId 검증 (per-item IDOR guard)
    for (const listing of dto.listings) {
      const owned = await this.listingRepo.verifyListingOwnership(
        listing.listingId,
        organizationId,
      );
      if (!owned) {
        throw new NotFoundException(
          `Listing ${listing.listingId} not found or not yours`,
        );
      }
    }

    // 2. 한 캠페인은 한 쿠팡 계정의 광고센터에 등록된다.
    const listings = await this.listingRepo.readCampaignListings(
      organizationId,
      dto.listings.map((listing) => listing.listingId),
    );
    const accountIds = [...new Set(listings.map((listing) => listing.channelAccountId))];
    if (accountIds.length !== 1) {
      throw new KiditemInvalidValueError('ADVERTISING_CAMPAIGN_ACCOUNTS_MIXED', {
        details: { channelAccountIds: accountIds },
      });
    }
    const withoutOptions = listings.filter((listing) => listing.optionIds.length === 0).map((listing) => listing.id);
    if (withoutOptions.length > 0) {
      throw new KiditemPreconditionError('ADVERTISING_AD_ACTION_NOT_EXECUTABLE', {
        details: { reason: 'listing_without_options', listingIds: withoutOptions },
        message: '판매 중인 옵션이 없는 상품은 광고센터에서 찾을 수 없습니다. 옵션이 있는 상품으로 다시 등록해 주세요.',
      });
    }

    // 3. 같은 이름의 열린 등록은 저장소가 조직·이름 잠금 안에서 거절하거나(진행·반영) 다시 준비한다(준비 안 됨).
    const priority: Priority = dto.grade === 'A' ? 'high' : dto.grade === 'B' ? 'medium' : 'low';

    const payload: Record<string, unknown> = {
      campaignName: dto.campaignName,
      adGroupName: dto.adGroupName,
      grade: dto.grade,
      goalType: 'SALES',
      dailyBudget: dto.dailyBudget,
      operationMode: dto.operationMode,
      listings: dto.listings,
      // 광고센터 등록 검색은 옵션(`vendor_item`) 단위라 리스팅 옵션 id로 찾는다.
      productIds: [...new Set(listings.flatMap((listing) => listing.optionIds))],
      smartTargetingBid: dto.smartTargetingBid ?? null,
      keywords: dto.keywords ?? [],
      nonSearchBid: dto.nonSearchBid ?? null,
      targetRoas: dto.targetRoas ?? null,
      pageType: 'campaign_registration',
    };

    // 실행할 수 없는 등록 내용은 커밋하지 않는다(상품 1~50, 정수 예산·목표 ROAS).
    if (!adActionCreateCampaign({ targetLabel: dto.campaignName, payload })) {
      throw new KiditemPreconditionError('ADVERTISING_AD_ACTION_NOT_EXECUTABLE', {
        details: { reason: 'registration_incomplete' },
        message: '캠페인 등록 내용(상품 1~50개, 원 단위 예산·목표 ROAS)이 맞지 않아 광고센터에 등록할 수 없습니다.',
      });
    }

    const { actionId, operationId } = await this.actionRepo.createCampaignAction({
      organizationId,
      channelAccountId: accountIds[0],
      campaignName: dto.campaignName,
      priority,
      reason: `${dto.grade}등급 전략 기반 캠페인 등록`,
      payload,
    });

    return { ok: true, actionId, operationId };
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE
  // ─────────────────────────────────────────────────────────────

  /** getRules / getRecommendations 공통 — strategy context hydrate 후 rule 평가. */
  private async buildActions(
    organizationId: string,
    period: '7d' | '14d' | 'month',
  ): Promise<AdStrategyAction[]> {
    const config = await this.adConfigService.getConfig(organizationId);
    const ctx = await this.strategyContextRepo.loadStrategyContext(
      organizationId,
      getProfitRateWindow(),
      period,
      config,
    );
    const listings = await this.loadExactAvailability(
      organizationId,
      ctx.listings,
    );
    return this.adGradeRules.calcActions({
      adGroups: ctx.adGroups,
      listings,
      gradeMap: ctx.gradeMap,
      profitRateByListing: ctx.profitRateByListing,
      channelStateByListing: ctx.channelStateByListing,
    });
  }

  private async loadExactAvailability(
    organizationId: string,
    listings: Parameters<typeof applyChannelSkuAvailability>[0],
  ) {
    if (listings.length === 0) return listings;
    const availability = await this.channelSkuAvailability.findByListingIds(
      organizationId,
      listings.map((listing) => listing.id),
    );
    return applyChannelSkuAvailability(listings, availability);
  }
}

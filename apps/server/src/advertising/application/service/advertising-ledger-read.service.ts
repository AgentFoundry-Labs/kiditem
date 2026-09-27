import { Inject, Injectable } from '@nestjs/common';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../channels/application/port/in/account/channel-account.port';
import { CHANNEL_OPTION_RECIPE_PORT, type ChannelOptionRecipePort } from '../../../channels/application/port/in/channel-option-recipe.port';
import { allocateBilledSpend } from '../../domain/ad-report-billing';
import { adReportEvidenceCutoff } from '../../domain/ad-report-confirmation';
import type { OwnerTransaction } from '../../../common/owner-transaction';
import { activeAdAccountIds, AD_SWEEP_CHANNEL } from '../../domain/ad-sweep-coverage';
import type {
  AdCalendarWindow,
  AdCoverage,
  AdListingWindowFacts,
  AdvertisingLedgerReadPort,
  AdWindowFacts,
  MonthlyAdAllocation,
} from '../port/in/capability/advertising-ledger-read.port';
import { AD_LEDGER_READ_REPOSITORY_PORT, type AdLedgerReadRepositoryPort } from '../port/out/repository/ad-ledger-read.repository.port';
import {
  AD_LEDGER_MONTHLY_ALLOCATION_PORT,
  type AdLedgerMonthlyAllocationPort,
} from '../port/out/repository/ad-ledger-monthly-allocation.repository.port';

/**
 * `ADVERTISING_LEDGER_READ_PORT` 구현(KID-372). 활성 쿠팡 계정을 Channels 계정 capability로 구해 원장 읽기 포트에 넘긴다.
 * 소비처(analytics·finance·products·readiness·common)는 이 서비스를 포트로만 주입받는다.
 */
@Injectable()
export class AdvertisingLedgerReadService implements AdvertisingLedgerReadPort {
  constructor(
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly accounts: ChannelAccountPort,
    @Inject(AD_LEDGER_READ_REPOSITORY_PORT) private readonly ledger: AdLedgerReadRepositoryPort,
    @Inject(CHANNEL_OPTION_RECIPE_PORT) private readonly recipes: Pick<ChannelOptionRecipePort, 'readConfirmedCompositions'>,
    @Inject(AD_LEDGER_MONTHLY_ALLOCATION_PORT) private readonly monthly: AdLedgerMonthlyAllocationPort,
  ) {}

  private async activeAccountIds(transaction: OwnerTransaction, organizationId: string): Promise<string[]> {
    const identities = await this.accounts.readProviderIdentities(transaction, { organizationId, channel: AD_SWEEP_CHANNEL });
    return activeAdAccountIds(identities);
  }

  async advertisingApplies(transaction: OwnerTransaction, organizationId: string): Promise<boolean> {
    return (await this.activeAccountIds(transaction, organizationId)).length > 0;
  }

  async readAdCoverage(transaction: OwnerTransaction, window: AdCalendarWindow): Promise<AdCoverage> {
    const activeAccountIds = await this.activeAccountIds(transaction, window.organizationId);
    return this.ledger.readAdCoverage(transaction, { ...window, activeAccountIds });
  }

  async readAdWindowFacts(transaction: OwnerTransaction, window: AdCalendarWindow): Promise<AdWindowFacts> {
    const activeAccountIds = await this.activeAccountIds(transaction, window.organizationId);
    return this.ledger.readAdWindowFacts(transaction, { ...window, activeAccountIds });
  }

  async readListingAdWindowFacts(transaction: OwnerTransaction, window: AdCalendarWindow): Promise<AdListingWindowFacts[]> {
    const activeAccountIds = await this.activeAccountIds(transaction, window.organizationId);
    return this.ledger.readListingAdWindowFacts(transaction, { ...window, activeAccountIds });
  }

  /**
   * 기여이익 월 배분(KID-372 ①b, 읽을 때 계산): 달마다 측정한 날의 리스팅 합(집행액·청구액)을 리스팅의 **현재 확정 레시피**
   * 무게(옵션 구성품 수량을 원천상품별로 더한 값)로 원천상품에 나눈다. 원 단위 나머지는 `allocateBilledSpend`처럼 무게가 큰
   * 원천상품부터 1원씩 준다. 옵션이 없거나 구성품 없는 옵션이 있는 리스팅은 레시피가 없어 배분하지 않는다(옛
   * `freezeRecipe` 규칙, 세대·publication 개념은 없다). `from`·`to`(달력일, `to` 제외)가 있으면 그 창 안의 측정일만 쓴다.
   */
  async readMonthlyAdAllocation(
    transaction: OwnerTransaction,
    input: Parameters<AdvertisingLedgerReadPort['readMonthlyAdAllocation']>[1],
  ): Promise<MonthlyAdAllocation[]> {
    const months = [...new Set(input.months)].sort();
    if (months.length === 0) return [];
    const monthStart = `${months[0]}-01`;
    const monthEnd = `${shiftMonth(months.at(-1)!, 1)}-01`;
    const from = input.from && input.from > monthStart ? input.from : monthStart;
    const to = input.to && input.to < monthEnd ? input.to : monthEnd;
    const activeAccountIds = await this.activeAccountIds(transaction, input.organizationId);
    const coverage = await this.ledger.readAdCoverage(transaction, {
      organizationId: input.organizationId,
      activeAccountIds,
      from,
      to,
    });
    const requested = new Set(months);
    const dates = coverage.measuredDates.filter((date) => requested.has(date.slice(0, 7)));
    const measuredDaysByMonth = new Map<string, number>();
    for (const date of dates) {
      measuredDaysByMonth.set(date.slice(0, 7), (measuredDaysByMonth.get(date.slice(0, 7)) ?? 0) + 1);
    }
    const sums = await this.monthly.readListingMonthSpends(transaction, {
      organizationId: input.organizationId,
      activeAccountIds,
      dates,
    });
    if (sums.length === 0) return [];
    const compositions = await this.recipes.readConfirmedCompositions(transaction, {
      organizationId: input.organizationId,
      listingIds: [...new Set(sums.map((row) => row.listingId))],
    });
    const recipeByListing = currentRecipes(compositions);
    return sums.flatMap((row) => {
      const recipe = recipeByListing.get(row.listingId);
      if (!recipe) return [];
      const weights = recipe.map((share) => share.weight);
      const spendShares = allocateBilledSpend(weights, row.spend);
      const billedShares = allocateBilledSpend(weights, row.billedSpend);
      return recipe.map((share, index): MonthlyAdAllocation => ({
        masterProductId: share.masterProductId,
        channelListingId: row.listingId,
        channelAccountId: row.channelAccountId,
        month: row.month,
        allocatedSpend: spendShares[index]!,
        allocatedBilledSpend: billedShares[index]!,
        measuredDays: measuredDaysByMonth.get(row.month) ?? 0,
      }));
    });
  }

  async readAdEvidenceCutoff(
    transaction: OwnerTransaction,
    input: Readonly<{ organizationId: string; closedDay: string }>,
  ): Promise<string> {
    const activeAccountIds = await this.activeAccountIds(transaction, input.organizationId);
    const collections = await this.ledger.readNewestAdReportEnds(transaction, {
      organizationId: input.organizationId,
      activeAccountIds,
    });
    return adReportEvidenceCutoff({ closedDay: input.closedDay, collections });
  }
}

/** `YYYY-MM`에서 `delta`달 뒤의 `YYYY-MM`. */
function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * 리스팅마다 현재 확정 레시피: 옵션 구성품 수량을 원천상품별로 더한 무게, 원천상품 id 순. 구성품 없는 옵션이 하나라도
 * 있으면 그 리스팅은 레시피가 없다.
 */
function currentRecipes(
  compositions: ReadonlyArray<Readonly<{ listingId: string; components: ReadonlyArray<Readonly<{ masterProductId: string; quantity: number }>> }>>,
): Map<string, Array<{ masterProductId: string; weight: number }>> {
  const weights = new Map<string, Map<string, number> | null>();
  for (const option of compositions) {
    const current = weights.get(option.listingId);
    if (current === null) continue;
    const valid = option.components.length > 0
      && option.components.every((component) => Number.isSafeInteger(component.quantity) && component.quantity > 0);
    if (!valid) {
      weights.set(option.listingId, null);
      continue;
    }
    const recipe = current ?? new Map<string, number>();
    for (const component of option.components) {
      recipe.set(component.masterProductId, (recipe.get(component.masterProductId) ?? 0) + component.quantity);
    }
    weights.set(option.listingId, recipe);
  }
  const result = new Map<string, Array<{ masterProductId: string; weight: number }>>();
  for (const [listingId, recipe] of weights) {
    if (!recipe || recipe.size === 0) continue;
    result.set(listingId, [...recipe.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([masterProductId, weight]) => ({ masterProductId, weight })));
  }
  return result;
}

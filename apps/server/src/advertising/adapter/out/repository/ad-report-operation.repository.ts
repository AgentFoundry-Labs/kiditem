import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AdReportAd, AdReportCampaign } from '@kiditem/shared/advertising-operations';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { resolveCoupangVendorId } from '../../../../channels/domain/account/coupang-account-identity';
import { parseBusinessDate } from '../../../../common/kst';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransaction, ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { AdReportOperationRepositoryPort } from '../../../application/port/out/repository/ad-report-operation.repository.port';
import type { AdReportBilling } from '../../../domain/ad-report-billing';
import type { AdReportDeletedCampaign, AdReportKeywordFact, AdReportProductFact } from '../../../domain/ad-report-operation';

type Tx = Prisma.TransactionClient;
const BATCH_SIZE = 1_000;

/**
 * 광고 보고서 원장 쓰기(KID-371). 두 사실 표와 정산 표는 확정 창의 행을 지우고 다시 넣고(재수집이 값을 바꾼다),
 * 캠페인·광고 현재 상태는 upsert한다. 모든 행에 실행 id를 찍는다. 리스팅은 Channels 카탈로그 계약으로만 맞춘다.
 */
@Injectable()
export class AdReportOperationRepository implements AdReportOperationRepositoryPort {
  constructor(
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,
    private readonly prisma: PrismaService,
  ) {}

  async readAccount(organizationId: string, channelAccountId: string, transaction?: OwnerTransaction) {
    const account = await this.channelAccounts.resolveActiveProvider(transaction ?? ownerTransaction(this.prisma), {
      organizationId,
      channel: 'coupang',
      accountId: channelAccountId,
    });
    if (!account || account.id !== channelAccountId) return null;
    return { id: account.id, vendorId: resolveCoupangVendorId(account) };
  }

  async publish(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      operationId: string;
      channelAccountId: string;
      startDate: string;
      endDate: string;
      observedAt: Date;
      products: readonly AdReportProductFact[];
      keywords: readonly AdReportKeywordFact[];
      billings: readonly AdReportBilling[];
      campaigns: readonly AdReportCampaign[];
      deletedCampaigns: readonly AdReportDeletedCampaign[];
      ads: readonly AdReportAd[];
    },
  ): Promise<void> {
    const tx = ownerTransactionClient(transaction);
    const scope = { organizationId: input.organizationId, channelAccountId: input.channelAccountId };
    const window = { gte: toDate(input.startDate), lte: toDate(input.endDate) };
    await tx.channelAdProductDailySnapshot.deleteMany({ where: { ...scope, date: window } });
    await tx.channelAdKeywordDailySnapshot.deleteMany({ where: { ...scope, date: window } });
    await tx.channelAdDailyBilling.deleteMany({ where: { ...scope, date: window } });

    const options = await this.optionListings(transaction, input.organizationId, input.channelAccountId);
    for (const batch of chunked(input.products)) {
      await tx.channelAdProductDailySnapshot.createMany({
        data: batch.map((fact) => ({
          ...scope,
          date: toDate(fact.date),
          campaignId: fact.campaignId,
          adGroupId: fact.adGroupId,
          vendorItemId: fact.vendorItemId,
          listingId: options.get(fact.vendorItemId)?.listingId ?? null,
          optionName: options.get(fact.vendorItemId)?.optionName ?? null,
          impressions: fact.impressions,
          clicks: fact.clicks,
          spend: fact.spend,
          orders: fact.orders,
          units: fact.units,
          revenue: fact.revenue,
          billedSpend: fact.billedSpend,
          operationId: input.operationId,
        })),
      });
    }
    for (const batch of chunked(input.keywords)) {
      await tx.channelAdKeywordDailySnapshot.createMany({
        data: batch.map((fact) => ({
          ...scope,
          date: toDate(fact.date),
          campaignId: fact.campaignId,
          adGroupId: fact.adGroupId,
          vendorItemId: fact.vendorItemId,
          keyword: fact.keyword,
          impressions: fact.impressions,
          clicks: fact.clicks,
          spend: fact.spend,
          orders: fact.orders,
          units: fact.units,
          revenue: fact.revenue,
          operationId: input.operationId,
        })),
      });
    }
    for (const batch of chunked(input.billings)) {
      await tx.channelAdDailyBilling.createMany({
        data: batch.map((billing) => ({ ...scope, ...billing, date: toDate(billing.date), operationId: input.operationId })),
      });
    }
    await this.upsertCampaigns(tx, input);
    await this.upsertDeletedCampaigns(tx, input);
    await this.upsertAds(tx, input);
  }

  /** 계정 카탈로그의 옵션 외부 id → 리스팅. 같은 옵션 id가 둘이면 켜진 리스팅을 쓴다. */
  private async optionListings(transaction: OwnerTransaction, organizationId: string, channelAccountId: string) {
    const catalog = await this.channelListings.readCatalogFacts(transaction, { organizationId, accountIds: [channelAccountId] });
    const options = new Map<string, { listingId: string; optionName: string | null; active: boolean }>();
    for (const listing of catalog) {
      for (const option of listing.options) {
        const active = listing.isActive && option.isActive;
        const current = options.get(option.externalOptionId);
        if (current && (current.active || !active)) continue;
        options.set(option.externalOptionId, { listingId: listing.id, optionName: option.itemName, active });
      }
    }
    return options;
  }

  private async upsertCampaigns(tx: Tx, input: { organizationId: string; channelAccountId: string; operationId: string; observedAt: Date; campaigns: readonly AdReportCampaign[] }) {
    for (const batch of chunked(input.campaigns)) {
      const values = batch.map((campaign) => Prisma.sql`(
        gen_random_uuid(), ${input.organizationId}::uuid, ${input.channelAccountId}::uuid, ${campaign.campaignId}, ${campaign.name},
        ${campaign.isActive}, ${campaign.status}, ${campaign.servingStatus}, ${campaign.budget}::int, ${campaign.budgetType},
        ${campaign.roasTarget}::numeric, ${campaign.adSelectionType}, ${campaign.totalAdCount}::int, ${input.observedAt}, NULL,
        ${input.operationId}::uuid, now(), now()
      )`);
      await tx.$executeRaw`
        INSERT INTO channel_ad_campaigns (
          id, organization_id, channel_account_id, campaign_id, name, is_active, status, serving_status, budget, budget_type,
          roas_target, ad_selection_type, total_ad_count, last_seen_at, deleted_at, operation_id, created_at, updated_at
        ) VALUES ${Prisma.join(values)}
        ON CONFLICT (organization_id, channel_account_id, campaign_id) DO UPDATE SET
          name = EXCLUDED.name,
          is_active = EXCLUDED.is_active,
          status = EXCLUDED.status,
          serving_status = EXCLUDED.serving_status,
          budget = EXCLUDED.budget,
          budget_type = EXCLUDED.budget_type,
          roas_target = EXCLUDED.roas_target,
          ad_selection_type = EXCLUDED.ad_selection_type,
          total_ad_count = EXCLUDED.total_ad_count,
          last_seen_at = EXCLUDED.last_seen_at,
          deleted_at = NULL,
          operation_id = EXCLUDED.operation_id,
          updated_at = now()
      `;
    }
  }

  /** 캠페인 목록에 없고 보고서 행에만 있는 캠페인: 삭제로 본다. 처음 삭제를 본 시각을 지키고 이름은 보고서 행에서. */
  private async upsertDeletedCampaigns(tx: Tx, input: { organizationId: string; channelAccountId: string; operationId: string; observedAt: Date; deletedCampaigns: readonly AdReportDeletedCampaign[] }) {
    for (const batch of chunked(input.deletedCampaigns)) {
      const values = batch.map((campaign) => Prisma.sql`(
        gen_random_uuid(), ${input.organizationId}::uuid, ${input.channelAccountId}::uuid, ${campaign.campaignId}, ${campaign.name},
        false, ${input.observedAt}, ${input.observedAt}, ${input.operationId}::uuid, now(), now()
      )`);
      await tx.$executeRaw`
        INSERT INTO channel_ad_campaigns (
          id, organization_id, channel_account_id, campaign_id, name, is_active, last_seen_at, deleted_at, operation_id, created_at, updated_at
        ) VALUES ${Prisma.join(values)}
        ON CONFLICT (organization_id, channel_account_id, campaign_id) DO UPDATE SET
          name = EXCLUDED.name,
          is_active = false,
          deleted_at = COALESCE(channel_ad_campaigns.deleted_at, EXCLUDED.deleted_at),
          operation_id = EXCLUDED.operation_id,
          updated_at = now()
      `;
    }
  }

  private async upsertAds(tx: Tx, input: { organizationId: string; channelAccountId: string; operationId: string; observedAt: Date; ads: readonly AdReportAd[] }) {
    for (const batch of chunked(input.ads)) {
      const values = batch.map((ad) => Prisma.sql`(
        gen_random_uuid(), ${input.organizationId}::uuid, ${input.channelAccountId}::uuid, ${ad.adId}, ${ad.campaignId}, ${ad.adGroupId},
        ${ad.vendorItemId}, ${ad.isActive}::boolean, ${ad.status}, ${input.observedAt}, ${input.operationId}::uuid, now(), now()
      )`);
      await tx.$executeRaw`
        INSERT INTO channel_ad_campaign_ads (
          id, organization_id, channel_account_id, ad_id, campaign_id, ad_group_id, vendor_item_id, is_active, status, last_seen_at,
          operation_id, created_at, updated_at
        ) VALUES ${Prisma.join(values)}
        ON CONFLICT (organization_id, channel_account_id, ad_id) DO UPDATE SET
          campaign_id = EXCLUDED.campaign_id,
          ad_group_id = EXCLUDED.ad_group_id,
          vendor_item_id = EXCLUDED.vendor_item_id,
          is_active = EXCLUDED.is_active,
          status = EXCLUDED.status,
          last_seen_at = EXCLUDED.last_seen_at,
          operation_id = EXCLUDED.operation_id,
          updated_at = now()
      `;
    }
  }
}

function toDate(value: string): Date {
  const date = parseBusinessDate(value);
  if (!date) throw new Error(`Invalid business date: ${value}`);
  return date;
}

function chunked<T>(items: readonly T[]): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += BATCH_SIZE) batches.push(items.slice(index, index + BATCH_SIZE));
  return batches;
}

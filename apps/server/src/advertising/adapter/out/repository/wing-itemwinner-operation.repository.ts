import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { WingItemwinnerRow } from '@kiditem/shared/advertising-operations';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { parseBusinessDate } from '../../../../common/kst';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransaction, ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { operatorErrorText } from '@kiditem/shared/errors';
import { matchListingFromRow, type ListingMap } from '../../../domain/listing-match';
import { normalizeWingListingState, normalizeWingOptionState } from '../../../domain/scrape-row-normalizers';
import type {
  WingItemwinnerOperationRepositoryPort,
  WingItemwinnerPublication,
} from '../../../application/port/out/repository/wing-itemwinner-operation.repository.port';

type Tx = Prisma.TransactionClient;

/** 알림의 원천 이름은 옛 attempt 그대로 둔다 — 몰 홈·조직도가 이 이름으로 알림을 몰에 붙인다. */
const ALERT_SOURCE_TYPE = 'coupang_wing_itemwinner';
const ALERT_TITLE = '쿠팡 Wing 아이템위너 수집 실패';
function alertDedupeKey(channelAccountId: string): string {
  return `source:${ALERT_SOURCE_TYPE}:${channelAccountId}`;
}

/**
 * Wing 아이템위너 원장 쓰기(KID-362). 옛 `wing-itemwinner-kpi-source.repository.ts`의 listing/option 일별 upsert를
 * 그대로 옮기고, 원시 스냅샷 대신 실행 id를 찍는다(`rawSnapshotId` null, `operationId`).
 */
@Injectable()
export class WingItemwinnerOperationRepository implements WingItemwinnerOperationRepositoryPort {
  constructor(
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async recordFailure(
    transaction: OwnerTransaction,
    input: { organizationId: string; operationId: string; channelAccountId: string; errorCode: string; errorMessage: string | null },
  ): Promise<void> {
    await this.alerts.recordTerminalOutcome(ownerTransactionClient(transaction), {
      code: input.errorCode,
      organizationId: input.organizationId,
      sourceType: ALERT_SOURCE_TYPE,
      attemptId: input.operationId,
      dedupeKey: alertDedupeKey(input.channelAccountId),
      title: ALERT_TITLE,
      message: input.errorMessage || operatorErrorText({ code: input.errorCode, source: ALERT_SOURCE_TYPE }),
      href: '/ad-ops',
    });
  }

  async resolveFailure(transaction: OwnerTransaction, input: { organizationId: string; operationId: string; channelAccountId: string }): Promise<void> {
    await this.alerts.resolveSourceFailure(ownerTransactionClient(transaction), {
      organizationId: input.organizationId,
      dedupeKey: alertDedupeKey(input.channelAccountId),
      attemptId: input.operationId,
    });
  }

  async isActiveCoupangAccount(organizationId: string, channelAccountId: string, transaction?: OwnerTransaction): Promise<boolean> {
    const account = await this.channelAccounts.resolveActiveProvider(transaction ?? ownerTransaction(this.prisma), {
      organizationId,
      channel: 'coupang',
      accountId: channelAccountId,
    });
    return account?.id === channelAccountId;
  }

  async publish(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      operationId: string;
      channelAccountId: string;
      businessDate: string;
      observedAt: Date;
      rows: readonly WingItemwinnerRow[];
    },
  ): Promise<WingItemwinnerPublication> {
    const tx = ownerTransactionClient(transaction);
    const businessDate = parseBusinessDate(input.businessDate);
    if (!businessDate) throw new Error(`Invalid business date: ${input.businessDate}`);
    const map = await this.listingMap(transaction, input.organizationId, input.channelAccountId);
    const observations = new Map<string, { listingId: string; isOfferWinner: boolean | null; lastObservedAt: string }>();
    let matchedCount = 0;
    for (const row of input.rows) {
      const raw = row as unknown as Record<string, unknown>;
      const match = matchListingFromRow(raw, map);
      if (!match.listingId) continue;
      matchedCount += 1;
      const listingState = normalizeWingListingState(raw);
      if (listingState) {
        observations.set(match.listingId, {
          listingId: match.listingId,
          isOfferWinner: listingState.isOfferWinner ?? null,
          lastObservedAt: input.observedAt.toISOString(),
        });
        await this.upsertListingDaily(tx, {
          organizationId: input.organizationId,
          operationId: input.operationId,
          listingId: match.listingId,
          externalId: match.externalId ?? '',
          businessDate,
          observedAt: input.observedAt,
          state: listingState,
        });
      }
      if (!match.listingOptionId) continue;
      const optionState = normalizeWingOptionState(raw);
      if (optionState) {
        await this.upsertOptionDaily(tx, {
          organizationId: input.organizationId,
          operationId: input.operationId,
          listingId: match.listingId,
          listingOptionId: match.listingOptionId,
          externalId: match.externalId ?? '',
          externalOptionId: match.externalOptionId ?? row.vendorItemId,
          businessDate,
          observedAt: input.observedAt,
          state: optionState,
        });
      }
    }
    return { matchedCount, listingObservations: [...observations.values()] };
  }

  private async listingMap(transaction: OwnerTransaction, organizationId: string, channelAccountId: string): Promise<ListingMap> {
    const catalog = await this.channelListings.readCatalogFacts(transaction, { organizationId, accountIds: [channelAccountId], activeOnly: true });
    const externalOptionIdMap = new Map<string, { listingId: string; listingOptionId: string; externalId: string }>();
    for (const listing of catalog) {
      for (const option of listing.options) {
        externalOptionIdMap.set(option.externalOptionId, { listingId: listing.id, listingOptionId: option.id, externalId: listing.externalId });
      }
    }
    return {
      channelAccountId,
      externalOptionIdMap,
      externalIdMap: new Map(catalog.map((listing) => [listing.externalId, { listingId: listing.id }])),
    };
  }

  private async upsertListingDaily(
    tx: Tx,
    input: {
      organizationId: string;
      operationId: string;
      listingId: string;
      externalId: string;
      businessDate: Date;
      observedAt: Date;
      state: NonNullable<ReturnType<typeof normalizeWingListingState>>;
    },
  ): Promise<void> {
    const observedState = Object.fromEntries(Object.entries(input.state).filter(([, value]) => value !== null && value !== undefined));
    await tx.channelListingDailySnapshot.upsert({
      where: {
        organizationId_listingId_businessDate: {
          organizationId: input.organizationId,
          listingId: input.listingId,
          businessDate: input.businessDate,
        },
      },
      create: {
        organizationId: input.organizationId,
        listingId: input.listingId,
        channel: 'coupang',
        externalId: input.externalId,
        businessDate: input.businessDate,
        ...input.state,
        sampleCount: 1,
        firstObservedAt: input.observedAt,
        lastObservedAt: input.observedAt,
        operationId: input.operationId,
      },
      update: {
        ...observedState,
        sampleCount: { increment: 1 },
        lastObservedAt: input.observedAt,
        operationId: input.operationId,
      },
      select: { id: true },
    });
  }

  private async upsertOptionDaily(
    tx: Tx,
    input: {
      organizationId: string;
      operationId: string;
      listingId: string;
      listingOptionId: string;
      externalId: string;
      externalOptionId: string;
      businessDate: Date;
      observedAt: Date;
      state: NonNullable<ReturnType<typeof normalizeWingOptionState>>;
    },
  ): Promise<void> {
    const observedState = Object.fromEntries(Object.entries(input.state).filter(([, value]) => value !== null && value !== undefined));
    await tx.channelListingOptionDailySnapshot.upsert({
      where: {
        organizationId_listingOptionId_businessDate: {
          organizationId: input.organizationId,
          listingOptionId: input.listingOptionId,
          businessDate: input.businessDate,
        },
      },
      create: {
        organizationId: input.organizationId,
        listingId: input.listingId,
        listingOptionId: input.listingOptionId,
        channel: 'coupang',
        externalId: input.externalId,
        externalOptionId: input.externalOptionId,
        businessDate: input.businessDate,
        ...input.state,
        sampleCount: 1,
        firstObservedAt: input.observedAt,
        lastObservedAt: input.observedAt,
        operationId: input.operationId,
      },
      update: {
        ...observedState,
        sampleCount: { increment: 1 },
        lastObservedAt: input.observedAt,
        operationId: input.operationId,
      },
      select: { id: true },
    });
  }
}

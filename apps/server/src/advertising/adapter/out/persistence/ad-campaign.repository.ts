// Campaign, product, keyword and trend reads for the ad-ops tabs, over the ad
// report ledger (KID-372) through the owner's ledger read adapter. This adapter
// owns the Repeatable Read transaction and resolves the active Coupang accounts
// through Channels; it never queries the ledger itself.

import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { addDays, businessDateKey } from '../../../../common/kst';
import { periodBounds, type AdPeriod } from '../../../domain/ad-metrics';
import { activeAdAccountIds, AD_SWEEP_CHANNEL } from '../../../domain/ad-sweep-coverage';
import {
  AD_LEDGER_READ_REPOSITORY_PORT,
  type AdCampaignSelector,
  type AdLedgerReadRepositoryPort,
  type AdLedgerReadScope,
} from '../../../application/port/out/repository/ad-ledger-read.repository.port';
import type {
  AdCampaignRepositoryPort,
  AdPeriodRows,
  AdTrendWindow,
} from '../../../application/port/out/repository/ad-campaign.repository.port';
import type { AdCoverage } from '../../../application/port/in/ledger/advertising-ledger-read.port';

const REPEATABLE_READ = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
} as const;

@Injectable()
export class AdCampaignRepositoryAdapter implements AdCampaignRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    @Inject(AD_LEDGER_READ_REPOSITORY_PORT) private readonly ledger: AdLedgerReadRepositoryPort,
  ) {}

  findCampaignRollups(organizationId: string, period: AdPeriod) {
    return this.inWindow(organizationId, periodWindow(period), async (tx, scope) =>
      periodRows(await this.ledger.readCampaignWindowRollups(tx, scope)));
  }

  findProductRollups(organizationId: string, period: AdPeriod, campaign?: AdCampaignSelector) {
    return this.inWindow(organizationId, periodWindow(period), async (tx, scope) =>
      periodRows(await this.ledger.readProductWindowRollups(tx, { ...scope, ...(campaign ? { campaign } : {}) })));
  }

  findKeywordRollups(organizationId: string, period: AdPeriod, campaign?: AdCampaignSelector) {
    return this.inWindow(organizationId, periodWindow(period), async (tx, scope) =>
      periodRows(await this.ledger.readKeywordWindowRollups(tx, { ...scope, ...(campaign ? { campaign } : {}) })));
  }

  findAdWindowDays(organizationId: string, dateRange: { from: Date; to: Date }): Promise<AdTrendWindow> {
    // `to` is an inclusive business date; the ledger window is half-open.
    const window = { from: businessDateKey(dateRange.from), to: businessDateKey(addDays(dateRange.to, 1)) };
    return this.inWindow(organizationId, window, async (tx, scope) => {
      const facts = await this.ledger.readAdWindowFacts(tx, scope);
      return {
        days: facts.days.map((day) => ({
          businessDate: day.businessDate,
          spend: day.spend,
          revenue: day.revenue,
          impressions: day.impressions,
          clicks: day.clicks,
          orders: day.orders,
        })),
        observedAt: facts.observedAt,
      };
    });
  }

  private inWindow<T>(
    organizationId: string,
    window: { from: string; to: string },
    read: (tx: OwnerTransaction, scope: AdLedgerReadScope) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (client) => {
      const tx = ownerTransaction(client);
      const identities = await this.channelAccounts.readProviderIdentities(tx, { organizationId, channel: AD_SWEEP_CHANNEL });
      return read(tx, { organizationId, activeAccountIds: activeAdAccountIds(identities), ...window });
    }, REPEATABLE_READ);
  }
}

/** A rolling ad period as the ledger's half-open `[from, to)` calendar window. */
function periodWindow(period: AdPeriod): { from: string; to: string } {
  const bounds = periodBounds(period);
  return { from: businessDateKey(bounds.from), to: businessDateKey(addDays(bounds.to, 1)) };
}

function periodRows<Row>(result: Readonly<{ coverage: AdCoverage; rows: readonly Row[] }>): AdPeriodRows<Row> {
  return {
    measuredDayCount: result.coverage.measuredDates.length,
    observedAt: result.coverage.observedAt,
    rows: result.rows,
  };
}

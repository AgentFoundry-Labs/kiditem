// Campaign, product target, keyword and trend reads, composed from the
// advertising target-day ledger's reader (`read/ad-target-facts`). This
// adapter owns the Repeatable Read transactions that combine a reader with
// the published campaign roster; it never queries the ledger itself.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { addDays } from '../../../../common/kst';
import { periodBounds, type AdPeriod } from '../../../domain/ad-metrics';
import {
  completeAdCampaignSourceIds,
  readAdWindowFacts,
  readCampaignWindowRollups,
  readCompleteAdKeywordFacts,
  readProductWindowRollups,
} from '../../../read/ad-target-facts';
import type {
  AdCampaignRepositoryPort,
  AdTrendWindow,
  CampaignCurrentSweep,
  CampaignRollup,
  KeywordTargetRollup,
  ProductTargetRollup,
} from '../../../application/port/out/repository/ad-campaign.repository.port';

const REPEATABLE_READ = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
} as const;

@Injectable()
export class AdCampaignRepositoryAdapter implements AdCampaignRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findCampaignSnapshot(organizationId: string, period: AdPeriod) {
    const window = halfOpenPeriod(period);
    return this.prisma.$transaction(async (tx) => ({
      rollups: (await readCampaignWindowRollups(tx, {
        organizationId,
        ...window,
      })) as CampaignRollup[],
      currentSweeps: await this.findLatestCompleteCampaignSweeps(tx, organizationId),
    }), REPEATABLE_READ);
  }

  private async findLatestCompleteCampaignSweeps(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<CampaignCurrentSweep[]> {
    const owners = await tx.$queryRaw<
      Array<{
        channelAccountId: string;
        qualityReport: {
          campaignDescriptors: Array<{
            campaignIdentity: string | null;
            campaignId: string | null;
            campaignName: string;
            status: string | null;
            onOff: string | null;
            mode: 'daily' | 'metadata' | 'raw_only';
          }>;
        };
      }>
    >(Prisma.sql`
      SELECT channel_account_id AS "channelAccountId", quality_report AS "qualityReport"
      FROM source_import_runs
      WHERE organization_id = ${organizationId}::uuid
        AND id IN (${completeAdCampaignSourceIds(organizationId)})
    `);
    return owners.map((owner) => {
      const campaigns = owner.qualityReport.campaignDescriptors;
      return {
        channelAccountId: owner.channelAccountId,
        rosterComplete: campaigns.every((campaign) => !!campaign.campaignIdentity),
        campaigns: campaigns
          .filter((campaign) => !!campaign.campaignIdentity)
          .map((campaign) => ({
            channelAccountId: owner.channelAccountId,
            campaignIdentity: campaign.campaignIdentity!,
            campaignId: campaign.campaignId,
            campaignName: campaign.campaignName,
            status: campaign.status,
            onOff: campaign.onOff,
          })),
      };
    });
  }

  findProductTargetRollups(
    organizationId: string,
    period: AdPeriod,
    campaign?: {
      channelAccountId: string;
      campaignIdentity: string;
    },
  ): Promise<ProductTargetRollup[]> {
    const window = halfOpenPeriod(period);
    return this.prisma.$transaction(
      async (tx) => (await readProductWindowRollups(tx, {
        organizationId,
        ...window,
        ...(campaign ? { campaign } : {}),
      })) as ProductTargetRollup[],
      REPEATABLE_READ,
    );
  }

  findKeywordTargetRollups(
    organizationId: string,
    period: AdPeriod,
    campaign?: {
      channelAccountId: string;
      campaignIdentity: string;
    },
  ): Promise<KeywordTargetRollup[]> {
    void period;
    return this.prisma.$transaction(
      async (tx) => {
        const { rows } = await readCompleteAdKeywordFacts(tx, organizationId, {
          ...campaign,
        });
        return rows;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  findAdWindowDays(
    organizationId: string,
    dateRange: { from: Date; to: Date },
  ): Promise<AdTrendWindow> {
    // `to` is an inclusive business date; the reader's window is half-open.
    return this.prisma.$transaction(
      (tx) => readAdWindowFacts(tx, {
        organizationId,
        from: dateRange.from,
        to: addDays(dateRange.to, 1),
      }),
      REPEATABLE_READ,
    );
  }
}

/** A rolling ad period as the reader's half-open `[from, to)` window. */
function halfOpenPeriod(period: AdPeriod): { from: Date; to: Date } {
  const bounds = periodBounds(period);
  return { from: bounds.from, to: addDays(bounds.to, 1) };
}

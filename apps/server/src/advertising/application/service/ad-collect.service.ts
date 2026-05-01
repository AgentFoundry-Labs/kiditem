import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AdCollectStatus } from '@kiditem/shared/advertising';

@Injectable()
export class AdCollectService {
  constructor(private readonly prisma: PrismaService) {}

  async startCollection(_period: string | undefined, _organizationId: string) {
    return {
      status: 'extension_required',
      message: '크롬 익스텐션의 정보 수집 버튼을 사용하세요.',
    };
  }

  /**
   * Collection status from `ChannelScrapeRun`. `lastCollectedAt` is the
   * latest run's `finishedAt ?? startedAt`. Counts are run rows under the
   * advertising vs wing buckets.
   *
   * Counting choice: we count `ChannelScrapeRun` rows (one per scrape session)
   * under each bucket because that matches the "수집 횟수" semantics the UI
   * has historically surfaced. `ChannelScrapeSnapshot` count would be
   * "row 수" which is reported separately by `getExtensionStatus`.
   */
  async getStatus(organizationId: string): Promise<AdCollectStatus> {
    try {
      const [latestRun, campaignCount, productCount] = await Promise.all([
        this.prisma.channelScrapeRun.findFirst({
          where: { organizationId },
          orderBy: [
            { finishedAt: 'desc' },
            { startedAt: 'desc' },
            { id: 'desc' },
          ],
          select: { finishedAt: true, startedAt: true },
        }),
        // Advertising-side scrape runs (campaign / keyword / product /
        // generic 'advertising') from the Coupang ad center.
        this.prisma.channelScrapeRun.count({
          where: {
            organizationId,
            source: 'advertising',
            pageType: { in: ['campaign', 'keyword', 'product', 'advertising'] },
          },
        }),
        // Wing-side scrape runs (item-winner status, traffic dashboard).
        this.prisma.channelScrapeRun.count({
          where: {
            organizationId,
            source: 'wing',
            pageType: { in: ['itemwinner', 'traffic'] },
          },
        }),
      ]);

      const lastCollectedAt =
        latestRun?.finishedAt ?? latestRun?.startedAt ?? null;

      return {
        lastCollectedAt,
        campaignSnapshotCount: campaignCount,
        productSnapshotCount: productCount,
      } satisfies AdCollectStatus;
    } catch (e) {
      if (e instanceof InternalServerErrorException) throw e;
      throw new InternalServerErrorException('수집 상태 조회 실패');
    }
  }
}

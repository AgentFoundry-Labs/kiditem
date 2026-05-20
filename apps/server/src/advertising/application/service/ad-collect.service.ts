import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import type { AdCollectStatus } from '@kiditem/shared/advertising';
import {
  CHANNEL_SCRAPE_REPOSITORY_PORT,
  type ChannelScrapeRepositoryPort,
} from '../port/out/repository/channel-scrape.repository.port';

@Injectable()
export class AdCollectService {
  constructor(
    @Inject(CHANNEL_SCRAPE_REPOSITORY_PORT)
    private readonly scrapeRepo: ChannelScrapeRepositoryPort,
  ) {}

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
   * Counting choice: scrape-run rows (one per scrape session) match the
   * "수집 횟수" semantics the UI surfaces. `ChannelScrapeSnapshot` count
   * would be "row 수" which is reported separately by `getExtensionStatus`.
   */
  async getStatus(organizationId: string): Promise<AdCollectStatus> {
    try {
      const summary = await this.scrapeRepo.findAdCollectStatus(organizationId);
      return {
        lastCollectedAt: summary.lastCollectedAt,
        campaignSnapshotCount: summary.campaignScrapeRunCount,
        productSnapshotCount: summary.productScrapeRunCount,
      } satisfies AdCollectStatus;
    } catch (e) {
      if (e instanceof InternalServerErrorException) throw e;
      throw new InternalServerErrorException('수집 상태 조회 실패');
    }
  }
}

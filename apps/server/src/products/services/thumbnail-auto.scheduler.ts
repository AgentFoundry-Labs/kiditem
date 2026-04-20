import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ThumbnailAutoService } from './thumbnail-auto.service';

@Injectable()
export class ThumbnailAutoScheduler {
  private readonly logger = new Logger(ThumbnailAutoScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly service: ThumbnailAutoService,
  ) {}

  /** 매일 KST 02:00 (= UTC 17:00 전날). 활성 회사별로 A등급 상품 30개 한도 배치 실행. */
  @Cron('0 17 * * *', { name: 'thumbnail-auto-daily', timeZone: 'UTC' })
  async dailyBatch() {
    if (process.env.THUMBNAIL_AUTO_DISABLE === 'true') {
      this.logger.log('일일 배치 skip (THUMBNAIL_AUTO_DISABLE=true)');
      return;
    }

    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    for (const company of companies) {
      try {
        const result = await this.service.runBatch(company.id, 30, 'cron');
        this.logger.log(
          `[daily] company=${company.name} attempted=${result.attempted} succeeded=${result.succeeded} failed=${result.failed} skipped=${result.skipped}`,
        );
      } catch (err) {
        this.logger.error(
          `[daily] company=${company.name} 실패: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
}

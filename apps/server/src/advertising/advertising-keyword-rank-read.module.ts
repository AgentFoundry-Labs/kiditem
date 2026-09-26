import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdvertisingKeywordRankReadAdapter } from './adapter/out/repository/keyword-rank-read.adapter';
import { ADVERTISING_KEYWORD_RANK_READ_PORT } from './application/port/in/capability/keyword-rank-read.port';

/**
 * 키워드 순위 읽기 capability만 내보낸다(readiness가 쓴다). AdvertisingModule 전체를 끌어오지 않는다.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    AdvertisingKeywordRankReadAdapter,
    { provide: ADVERTISING_KEYWORD_RANK_READ_PORT, useExisting: AdvertisingKeywordRankReadAdapter },
  ],
  exports: [ADVERTISING_KEYWORD_RANK_READ_PORT],
})
export class AdvertisingKeywordRankReadModule {}

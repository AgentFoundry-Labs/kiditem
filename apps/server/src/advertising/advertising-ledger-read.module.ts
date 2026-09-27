import { Module } from '@nestjs/common';
import { ChannelCatalogModule } from '../channels/channel-catalog.module';
import { AdLedgerReadPersistenceAdapter } from './adapter/out/persistence/ad-ledger-read.persistence.adapter';
import { AdLedgerMonthlyAllocationPersistenceAdapter } from './adapter/out/persistence/ad-ledger-monthly-allocation.persistence.adapter';
import { AD_LEDGER_MONTHLY_ALLOCATION_PORT } from './application/port/out/repository/ad-ledger-monthly-allocation.repository.port';
import { ADVERTISING_LEDGER_READ_PORT } from './application/port/in/capability/advertising-ledger-read.port';
import { AD_LEDGER_READ_REPOSITORY_PORT } from './application/port/out/repository/ad-ledger-read.repository.port';
import { AdvertisingLedgerReadService } from './application/service/advertising-ledger-read.service';

/**
 * 광고 원장 읽기 capability(`ADVERTISING_LEDGER_READ_PORT`, KID-372)만 내보낸다. 소비처(analytics·finance·products·
 * readiness)가 AdvertisingModule 전체를 끌어오지 않게 따로 둔다 — Products → Finance → Advertising 순환을 피한다.
 * 바깥 모듈은 in-port만 주입받는다 — out-port 토큰은 내보내지 않는다(광고 owner 안의 바인딩은 AdvertisingModule 몫).
 */
@Module({
  imports: [ChannelCatalogModule],
  providers: [
    AdLedgerReadPersistenceAdapter,
    { provide: AD_LEDGER_READ_REPOSITORY_PORT, useExisting: AdLedgerReadPersistenceAdapter },
    AdLedgerMonthlyAllocationPersistenceAdapter,
    { provide: AD_LEDGER_MONTHLY_ALLOCATION_PORT, useExisting: AdLedgerMonthlyAllocationPersistenceAdapter },
    AdvertisingLedgerReadService,
    { provide: ADVERTISING_LEDGER_READ_PORT, useExisting: AdvertisingLedgerReadService },
  ],
  exports: [ADVERTISING_LEDGER_READ_PORT],
})
export class AdvertisingLedgerReadModule {}

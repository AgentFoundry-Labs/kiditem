import { Inject, Injectable } from '@nestjs/common';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../channels/application/port/in/account/channel-account.port';
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

/**
 * `ADVERTISING_LEDGER_READ_PORT` 구현(KID-372). 활성 쿠팡 계정을 Channels 계정 capability로 구해 원장 읽기 포트에 넘긴다.
 * 소비처(analytics·finance·products·readiness·common)는 이 서비스를 포트로만 주입받는다.
 */
@Injectable()
export class AdvertisingLedgerReadService implements AdvertisingLedgerReadPort {
  constructor(
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly accounts: ChannelAccountPort,
    @Inject(AD_LEDGER_READ_REPOSITORY_PORT) private readonly ledger: AdLedgerReadRepositoryPort,
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

  async readMonthlyAdAllocation(): Promise<MonthlyAdAllocation[]> {
    // KID-372 ①b(기여이익 트랙)가 원장 읽기 포트에 월 배분을 더해 채운다.
    throw new Error('KID-372 ①b가 채우기 전에는 월 배분을 읽을 수 없습니다');
  }
}

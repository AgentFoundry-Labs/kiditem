import { Inject, Injectable } from '@nestjs/common';
import {
  CHANNEL_ACCOUNT_PORT,
  type ChannelAccountPort,
} from '../../../../channels/application/port/in/account/channel-account.port';
import type { SourcingChannelAccountPort } from '../../../application/port/out/cross-domain/sourcing-channel-account.port';

@Injectable()
export class SourcingChannelAccountAdapter implements SourcingChannelAccountPort {
  constructor(@Inject(CHANNEL_ACCOUNT_PORT) private readonly accounts: ChannelAccountPort) {}

  async isActiveCoupangAccount(organizationId: string, channelAccountId: string): Promise<boolean> {
    const active = await this.accounts.listActive(organizationId);
    return active.some((account) => account.id === channelAccountId && account.channel === 'coupang');
  }
}

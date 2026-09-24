import { Inject, Controller, Get } from '@nestjs/common';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort, type MallAccount, type MallAccountPassword, type UpdateMallAccountInput } from '../../../../application/port/in/account/channel-account.port';

@Controller('channels/accounts')
export class ChannelAccountListController {
  constructor(@Inject(CHANNEL_ACCOUNT_PORT) private readonly accounts: ChannelAccountPort) {}

  @Get()
  list(@CurrentOrganization() organizationId: string) {
    return this.accounts.listActive(organizationId);
  }
}

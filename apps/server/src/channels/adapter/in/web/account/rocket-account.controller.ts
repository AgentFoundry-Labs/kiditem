import { Inject, Controller, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort, type MallAccount, type MallAccountPassword, type UpdateMallAccountInput } from '../../../../application/port/in/account/channel-account.port';

@Controller('channels/accounts/rocket')
export class RocketAccountController {
  constructor(@Inject(CHANNEL_ACCOUNT_PORT) private readonly accounts: ChannelAccountPort) {}

  @Post('bootstrap')
  bootstrap(@CurrentOrganization() organizationId: string) {
    return this.accounts.ensureRocketAccount(organizationId);
  }
}

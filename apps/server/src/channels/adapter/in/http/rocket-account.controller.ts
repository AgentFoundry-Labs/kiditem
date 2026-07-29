import { Controller, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ChannelAccountService } from '../../../application/service/channel-account.service';

@Controller('channels/accounts/rocket')
export class RocketAccountController {
  constructor(private readonly accounts: ChannelAccountService) {}

  @Post('bootstrap')
  bootstrap(@CurrentOrganization() organizationId: string) {
    return this.accounts.ensureRocketAccount(organizationId);
  }
}

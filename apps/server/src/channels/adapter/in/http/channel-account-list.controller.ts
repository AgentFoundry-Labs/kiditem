import { Controller, Get } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ChannelAccountQueryService } from '../../../application/service/channel-account-query.service';

@Controller('channels/accounts')
export class ChannelAccountListController {
  constructor(private readonly accounts: ChannelAccountQueryService) {}

  @Get()
  list(@CurrentOrganization() organizationId: string) {
    return this.accounts.listActive(organizationId);
  }
}

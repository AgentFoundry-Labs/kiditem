import { Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { SourcingShadowSignalService } from '../../../application/service/sourcing-shadow-signal.service';
import { TrendHistoryQueryDto } from './dto';

@Controller('sourcing/trend/shadow')
export class MarketShadowSignalController {
  constructor(
    private readonly shadowSignals: SourcingShadowSignalService,
  ) {}

  @Post('collect')
  collect(@CurrentOrganization() organizationId: string) {
    return this.shadowSignals.collect(organizationId);
  }

  @Get()
  async listRecent(
    @Query() query: TrendHistoryQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    const snapshots = await this.shadowSignals.listRecent(
      organizationId,
      query.days ?? 30,
    );
    return { snapshots };
  }
}

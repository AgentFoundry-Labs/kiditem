import { Body, Controller, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { SourcingMarketModelService } from '../../../application/service/sourcing-market-model.service';
import { RunSourcingMarketModelDto } from './dto/sourcing-market-model.dto';

@Controller('sourcing/market-model')
export class SourcingMarketModelController {
  constructor(private readonly marketModel: SourcingMarketModelService) {}

  @Post('run')
  async run(
    @Body() body: RunSourcingMarketModelDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.marketModel.run({
      organizationId,
      days: body.days,
      limit: body.limit,
    });
  }

  @Post('latest')
  async latest(
    @Body() body: RunSourcingMarketModelDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.marketModel.latestOrRun({
      organizationId,
      days: body.days,
      limit: body.limit,
    });
  }
}

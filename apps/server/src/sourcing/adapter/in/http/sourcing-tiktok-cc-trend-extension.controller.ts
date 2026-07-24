import { Body, Controller, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { TrendCollectService } from '../../../application/service/trend-collect.service';
import { IngestExtensionTiktokCcTrendResultsDto } from './dto';

@Controller('sourcing/extension/trend')
export class SourcingTiktokCcTrendExtensionController {
  constructor(private readonly trends: TrendCollectService) {}

  @Post('tiktok-cc-results')
  ingestTiktokCcResults(
    @Body() body: IngestExtensionTiktokCcTrendResultsDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.trends.ingestTiktokCcResults(organizationId, body);
  }
}

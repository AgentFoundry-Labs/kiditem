import { Body, Controller, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { TrendCollectService } from '../../../application/service/trend-collect.service';
import { IngestExtension1688TrendResultsDto } from './dto';

@Controller('sourcing/extension/trend')
export class Sourcing1688TrendExtensionController {
  constructor(private readonly trends: TrendCollectService) {}

  @Post('1688-results')
  ingest1688Results(
    @Body() body: IngestExtension1688TrendResultsDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.trends.ingest1688ExtensionResults(organizationId, body);
  }
}

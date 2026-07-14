import { Body, Controller, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { LiveCommerceService } from '../../../application/service/live-commerce.service';
import { IngestExtensionLiveCommerceDto } from './dto/live-commerce.dto';

@Controller('sourcing/extension/trend')
export class SourcingLiveCommerceExtensionController {
  constructor(private readonly liveCommerce: LiveCommerceService) {}

  @Post('live-commerce-results')
  ingest(
    @Body() body: IngestExtensionLiveCommerceDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.liveCommerce.ingestExtension(organizationId, body);
  }
}

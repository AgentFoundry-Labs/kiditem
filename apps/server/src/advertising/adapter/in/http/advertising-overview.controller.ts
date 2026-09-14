import { Controller, Get, Query } from '@nestjs/common';
import { AdvertisingService } from '../../../application/service/advertising.service';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ListAdsQueryDto } from './dto';

@Controller('ads')
export class AdvertisingOverviewController {
  constructor(private readonly advertisingService: AdvertisingService) {}

  @Get('hub')
  getHub(@CurrentOrganization() organizationId: string) {
    return this.advertisingService.getHubData(organizationId);
  }

  @Get()
  findAll(@Query() query: ListAdsQueryDto, @CurrentOrganization() organizationId: string) {
    return this.advertisingService.findAll(query, organizationId);
  }
}

import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { AdvertisingService } from '../../../application/service/advertising.service';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ChangeAdTierBodyDto, ListAdsQueryDto } from './dto';

@Controller('ads')
export class AdvertisingOverviewController {
  constructor(private readonly advertisingService: AdvertisingService) {}

  @Get('hub')
  getHub(@CurrentOrganization() organizationId: string) {
    return this.advertisingService.getHubData(organizationId);
  }

  @Patch(':id/tier')
  changeTier(
    @Param('id') id: string,
    @Body() body: ChangeAdTierBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.advertisingService.changeTier(id, body.adTier, organizationId);
  }

  @Get()
  findAll(@Query() query: ListAdsQueryDto, @CurrentOrganization() organizationId: string) {
    return this.advertisingService.findAll(query, organizationId);
  }
}

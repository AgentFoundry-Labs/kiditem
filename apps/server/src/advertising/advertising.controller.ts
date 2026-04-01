import { Controller, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { AdvertisingService } from './advertising.service';
import { ListAdsQueryDto, ChangeAdTierBodyDto } from './dto';

@Controller('ads')
export class AdvertisingController {
  constructor(private readonly advertisingService: AdvertisingService) {}

  @Get('hub')
  getHub() {
    return this.advertisingService.getHubData();
  }

  @Patch(':id/tier')
  changeTier(
    @Param('id') id: string,
    @Body() body: ChangeAdTierBodyDto,
  ) {
    return this.advertisingService.changeTier(id, body.adTier);
  }

  @Get()
  findAll(@Query() query: ListAdsQueryDto) {
    return this.advertisingService.findAll(query as any);
  }
}

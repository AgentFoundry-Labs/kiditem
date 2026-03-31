import { Controller, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { AdsService } from '../services/ads.service';
import { ListAdsQueryDto, ChangeAdTierBodyDto } from '../dto';

@Controller('ads')
export class AdsController {
  constructor(private readonly adsService: AdsService) {}

  @Get('hub')
  getHub() {
    return this.adsService.getHubData();
  }

  @Patch(':id/tier')
  changeTier(
    @Param('id') id: string,
    @Body() body: ChangeAdTierBodyDto,
  ) {
    return this.adsService.changeTier(id, body.adTier);
  }

  @Get()
  findAll(@Query() query: ListAdsQueryDto) {
    return this.adsService.findAll(query as any);
  }
}

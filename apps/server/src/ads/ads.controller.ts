import { Controller, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { AdsService } from './ads.service';

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
    @Body('adTier') adTier: string,
  ) {
    return this.adsService.changeTier(id, adTier);
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adsService.findAll({ page, limit });
  }
}

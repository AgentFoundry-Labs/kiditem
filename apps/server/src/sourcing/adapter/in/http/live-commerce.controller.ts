import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { LiveCommerceService } from '../../../application/service/live-commerce.service';
import { CollectTaobaoLiveDto, LiveCommerceQueryDto } from './dto/live-commerce.dto';

@Controller('sourcing/live-commerce')
export class LiveCommerceController {
  constructor(private readonly liveCommerce: LiveCommerceService) {}

  @Get('status')
  status(@CurrentOrganization() organizationId: string) {
    return this.liveCommerce.status(organizationId);
  }

  @Post('taobao/collect')
  collectTaobao(
    @Body() body: CollectTaobaoLiveDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.liveCommerce.collectTaobao(organizationId, body);
  }

  @Get('snapshots')
  list(
    @Query() query: LiveCommerceQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.liveCommerce.list(organizationId, {
      days: query.days ?? 7,
      source: query.source,
    });
  }
}

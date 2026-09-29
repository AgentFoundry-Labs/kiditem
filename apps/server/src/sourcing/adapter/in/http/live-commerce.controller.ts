import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { LiveCommerceService } from '../../../application/service/live-commerce.service';
import { LiveCommerceQueryDto, TaobaoLiveRequestDto } from './dto/live-commerce.dto';

@Controller('sourcing/live-commerce')
export class LiveCommerceController {
  constructor(private readonly liveCommerce: LiveCommerceService) {}

  @Post('taobao/attempts')
  async collectTaobao(
    @Body() input: TaobaoLiveRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.liveCommerce.collectTaobao(organizationId, input, idempotencyKey ?? '');
  }

  @Get('status')
  async status(
    @CurrentOrganization() organizationId: string,
    @Query() input: TaobaoLiveRequestDto = {},
  ) {
    return this.liveCommerce.status(organizationId, input);
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

  @Get('keywords')
  keywordDigest(
    @Query() query: LiveCommerceQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.liveCommerce.keywordDigest(organizationId, {
      days: query.days ?? 7,
      source: query.source,
    });
  }
}

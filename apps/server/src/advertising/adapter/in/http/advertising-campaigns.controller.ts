import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AdCampaignsService } from '../../../application/service/ad-campaigns.service';
import { AdStrategyService } from '../../../application/service/ad-strategy.service';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  AdProductQueryDto,
  CampaignQueryDto,
  RegisterCampaignDto,
  TrendsQueryDto,
} from './dto';

@Controller('ads')
export class AdvertisingCampaignsController {
  constructor(
    private readonly adCampaignsService: AdCampaignsService,
    private readonly adStrategyService: AdStrategyService,
  ) {}

  @Get('products')
  getProducts(
    @Query() query: AdProductQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.adCampaignsService.getProducts(
      query.period ?? '14d',
      organizationId,
      query.channelAccountId && query.campaignIdentity
        ? {
            channelAccountId: query.channelAccountId,
            campaignIdentity: query.campaignIdentity,
          }
        : undefined,
    );
  }

  @Get('campaigns/trends')
  getTrends(@Query() query: TrendsQueryDto, @CurrentOrganization() organizationId: string) {
    return this.adCampaignsService.getTrends(query.period ?? '14d', query.days, organizationId);
  }

  @Post('campaigns/register')
  registerCampaign(
    @Body() body: RegisterCampaignDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.adStrategyService.registerCampaign(body, organizationId);
  }

  @Get('campaigns')
  getCampaigns(@Query() query: CampaignQueryDto, @CurrentOrganization() organizationId: string) {
    const period = (query.period ?? '7d') as '7d' | '14d' | 'month';
    return this.adCampaignsService.getCampaigns(period, organizationId);
  }
}

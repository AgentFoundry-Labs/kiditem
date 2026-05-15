import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { AdConfigService } from '../../../application/service/ad-config.service';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { UpdateAdConfigDto } from './dto';

@Controller('ads')
export class AdvertisingConfigController {
  constructor(private readonly adConfigService: AdConfigService) {}

  @Get('config')
  getConfig(@CurrentOrganization() organizationId: string) {
    return this.adConfigService.getConfig(organizationId);
  }

  @Patch('config/:key')
  updateConfig(
    @Param('key') key: string,
    @Body() body: UpdateAdConfigDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.adConfigService.updateConfig(`ads.${key}`, body.value, organizationId);
  }
}

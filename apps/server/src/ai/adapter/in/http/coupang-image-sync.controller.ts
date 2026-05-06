import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CoupangImageSyncService } from '../../../application/service/coupang-image-sync.service';
import { CoupangImageSyncRowsDto } from './dto/coupang-image-sync.dto';

@Controller('coupang-image-sync')
export class CoupangImageSyncController {
  constructor(private readonly service: CoupangImageSyncService) {}

  @Post()
  start(@CurrentOrganization() organizationId: string) {
    return this.service.start(organizationId);
  }

  @Post('from-rows')
  startFromRows(
    @CurrentOrganization() organizationId: string,
    @Body() body: CoupangImageSyncRowsDto,
  ) {
    return this.service.startFromRows(organizationId, body.rows);
  }

  @Get()
  current(@CurrentOrganization() organizationId: string) {
    return { job: this.service.getCurrent(organizationId) };
  }

  @Get(':jobId')
  status(@Param('jobId') jobId: string, @CurrentOrganization() organizationId: string) {
    return this.service.getStatus(jobId, organizationId);
  }
}

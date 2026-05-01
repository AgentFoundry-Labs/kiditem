import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ListTrackingQueryDto, UpdateMetricsDto } from './dto/thumbnail-tracking.dto';
import { ThumbnailTrackingService } from '../../../application/service/thumbnail-tracking.service';

@Controller('thumbnail-tracking')
export class ThumbnailTrackingController {
  constructor(private readonly trackingService: ThumbnailTrackingService) {}

  @Get()
  list(@Query() query: ListTrackingQueryDto, @CurrentOrganization() organizationId: string) {
    return this.trackingService.findAll(
      { page: query.page, limit: query.limit, status: query.status },
      organizationId,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateMetricsDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.trackingService.updateMetrics(id, body, organizationId);
  }
}

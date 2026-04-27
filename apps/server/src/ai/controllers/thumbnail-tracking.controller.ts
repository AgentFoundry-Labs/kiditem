import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import { ListTrackingQueryDto, UpdateMetricsDto } from '../dto/thumbnail-tracking.dto';
import { ThumbnailTrackingService } from '../services/thumbnail-tracking.service';

@Controller('thumbnail-tracking')
export class ThumbnailTrackingController {
  constructor(private readonly trackingService: ThumbnailTrackingService) {}

  @Get()
  list(@Query() query: ListTrackingQueryDto, @CurrentCompany() companyId: string) {
    return this.trackingService.findAll(
      { page: query.page, limit: query.limit, status: query.status },
      companyId,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateMetricsDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.trackingService.updateMetrics(id, body, companyId);
  }
}

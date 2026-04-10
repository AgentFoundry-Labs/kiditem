import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ThumbnailTrackingService } from '../services/thumbnail-tracking.service';
import { CreateTrackingDto, UpdateMetricsDto, ListTrackingQueryDto } from '../dto';

@Controller('thumbnail-tracking')
export class ThumbnailTrackingController {
  constructor(private readonly trackingService: ThumbnailTrackingService) {}

  @Get()
  findAll(@Query() query: ListTrackingQueryDto) {
    return this.trackingService.findAll({
      page: query.page,
      limit: query.limit,
      status: query.status,
    });
  }

  @Post()
  create(@Body() body: CreateTrackingDto) {
    return this.trackingService.create(body);
  }

  @Patch(':id')
  updateMetrics(@Param('id') id: string, @Body() body: UpdateMetricsDto) {
    return this.trackingService.updateMetrics(id, body);
  }
}

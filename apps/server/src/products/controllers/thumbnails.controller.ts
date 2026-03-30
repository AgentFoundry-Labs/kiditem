import { Controller, Get, Query } from '@nestjs/common';
import {
  ThumbnailsService,
  type ThumbnailsListResponse,
  type ThumbnailSummary,
} from '../services/thumbnails.service';

@Controller('thumbnails')
export class ThumbnailsController {
  constructor(private readonly thumbnailsService: ThumbnailsService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<ThumbnailsListResponse> {
    return this.thumbnailsService.findAll({ page, limit });
  }

  @Get('summary')
  getSummary(): Promise<ThumbnailSummary> {
    return this.thumbnailsService.getSummary();
  }
}

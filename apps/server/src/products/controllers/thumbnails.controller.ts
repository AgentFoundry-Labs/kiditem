import { Controller, Get, Query } from '@nestjs/common';
import {
  ThumbnailsService,
  type ThumbnailsListResponse,
  type ThumbnailSummary,
} from '../services/thumbnails.service';
import { ListThumbnailsQueryDto } from '../dto';

@Controller('thumbnails')
export class ThumbnailsController {
  constructor(private readonly thumbnailsService: ThumbnailsService) {}

  @Get()
  findAll(@Query() query: ListThumbnailsQueryDto): Promise<ThumbnailsListResponse> {
    return this.thumbnailsService.findAll(query as any);
  }

  @Get('summary')
  getSummary(): Promise<ThumbnailSummary> {
    return this.thumbnailsService.getSummary();
  }
}

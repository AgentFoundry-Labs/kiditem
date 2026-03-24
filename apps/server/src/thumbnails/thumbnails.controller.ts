import { Controller, Get } from '@nestjs/common';
import { ThumbnailsService } from './thumbnails.service';

@Controller('thumbnails')
export class ThumbnailsController {
  constructor(private readonly thumbnailsService: ThumbnailsService) {}

  @Get()
  findAll() {
    return this.thumbnailsService.findAll();
  }
}

import { Controller, DefaultValuePipe, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import { ThumbnailGenerationService } from '../services/thumbnail-generation.service';

@Controller('thumbnail-auto')
export class ThumbnailAutoController {
  constructor(private readonly generationService: ThumbnailGenerationService) {}

  @Post('batch')
  runBatch(
    @CurrentCompany() companyId: string,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
  ) {
    return this.generationService.createAutoBatch(companyId, limit);
  }
}

import { Controller, DefaultValuePipe, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';
import { ThumbnailAutoService } from '../../../application/service/thumbnail-auto.service';

@Controller('thumbnail-auto')
export class ThumbnailAutoController {
  constructor(private readonly autoService: ThumbnailAutoService) {}

  @Post('batch')
  runBatch(
    @CurrentCompany() companyId: string,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
  ) {
    return this.autoService.runBatch(companyId, limit);
  }
}

import { Controller, Post, Param, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import { ThumbnailAutoService } from '../services/thumbnail-auto.service';

@Controller('thumbnail-auto')
export class ThumbnailAutoController {
  constructor(private readonly service: ThumbnailAutoService) {}

  /** 단일 상품 수동 재편집 — Hub UI 버튼에서 호출 */
  @Post('run/:productId')
  runOne(@Param('productId') productId: string, @CurrentCompany() companyId: string) {
    return this.service.runOne(productId, companyId, 'manual');
  }

  /** A등급 상품 배치 수동 실행 */
  @Post('batch')
  runBatch(
    @CurrentCompany() companyId: string,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
  ) {
    return this.service.runBatch(companyId, limit, 'manual');
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';
import { UnshippedQueryService } from '../../../application/service/unshipped-query.service';
import { ListUnshippedQueryDto } from './dto';

@Controller('unshipped')
export class UnshippedController {
  constructor(private readonly unshipped: UnshippedQueryService) {}

  @Get()
  findAll(
    @CurrentCompany() companyId: string,
    @Query() query: ListUnshippedQueryDto,
  ) {
    return this.unshipped.findAll(query, companyId);
  }
}

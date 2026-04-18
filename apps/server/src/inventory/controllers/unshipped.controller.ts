import { Controller, Get, Query } from '@nestjs/common';
import { UnshippedService } from '../services/unshipped.service';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import { ListUnshippedQueryDto } from '../dto';

@Controller('unshipped')
export class UnshippedController {
  constructor(private readonly unshippedService: UnshippedService) {}

  @Get()
  findAll(
    @CurrentCompany() companyId: string,
    @Query() query: ListUnshippedQueryDto,
  ) {
    return this.unshippedService.findAll(query, companyId);
  }
}

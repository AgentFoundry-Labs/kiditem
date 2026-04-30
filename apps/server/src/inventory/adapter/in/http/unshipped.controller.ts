import { Controller, Get, Inject, Query } from '@nestjs/common';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';
import {
  UNSHIPPED_PORT,
  type UnshippedPort,
} from '../../../application/port/in/unshipped.port';
import { ListUnshippedQueryDto } from './dto';

@Controller('unshipped')
export class UnshippedController {
  constructor(
    @Inject(UNSHIPPED_PORT) private readonly unshipped: UnshippedPort,
  ) {}

  @Get()
  findAll(
    @CurrentCompany() companyId: string,
    @Query() query: ListUnshippedQueryDto,
  ) {
    return this.unshipped.findAll(query, companyId);
  }
}

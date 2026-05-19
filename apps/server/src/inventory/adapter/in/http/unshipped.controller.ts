import { Controller, Get, Inject, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  UNSHIPPED_PORT,
  type UnshippedPort,
} from '../../../application/port/in/fulfillment/unshipped.port';
import { ListUnshippedQueryDto } from './dto';

@Controller('unshipped')
export class UnshippedController {
  constructor(
    @Inject(UNSHIPPED_PORT) private readonly unshipped: UnshippedPort,
  ) {}

  @Get()
  findAll(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListUnshippedQueryDto,
  ) {
    return this.unshipped.findAll(query, organizationId);
  }
}

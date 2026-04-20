import { Controller, Get } from '@nestjs/common';
import { ReadinessService } from './readiness.service';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';
import type { ReadinessResponse } from '@kiditem/shared';

@Controller('readiness')
export class ReadinessController {
  constructor(private readonly service: ReadinessService) {}

  @Get()
  get(@CurrentCompany() companyId: string): Promise<ReadinessResponse> {
    return this.service.getStatus(companyId);
  }
}

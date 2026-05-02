import { Controller, Get } from '@nestjs/common';
import { ReadinessService } from './readiness.service';
import { CurrentOrganization } from '../auth/decorators/current-organization.decorator';
import type { ReadinessResponse } from '@kiditem/shared/readiness';

@Controller('readiness')
export class ReadinessController {
  constructor(private readonly service: ReadinessService) {}

  @Get()
  get(@CurrentOrganization() organizationId: string): Promise<ReadinessResponse> {
    return this.service.getStatus(organizationId);
  }
}

import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { FeatureGateService } from './feature-gate.service';

@Controller('feature-gates')
export class FeatureGateController {
  constructor(private readonly service: FeatureGateService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post(':name')
  upsert(
    @Param('name') name: string,
    @Body()
    body: {
      enabled?: boolean;
      description?: string;
      allowedCompanies?: string[];
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.service.upsert(name, body);
  }

  @Delete(':name')
  delete(@Param('name') name: string) {
    return this.service.delete(name);
  }
}

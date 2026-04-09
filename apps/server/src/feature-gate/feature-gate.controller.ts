import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { FeatureGateService } from './feature-gate.service';
import { UpsertFeatureGateDto } from './dto';

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
    @Body() body: UpsertFeatureGateDto,
  ) {
    return this.service.upsert(name, body);
  }

  @Delete(':name')
  delete(@Param('name') name: string) {
    return this.service.delete(name);
  }
}

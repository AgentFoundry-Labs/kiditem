import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { FeatureGateService } from './feature-gate.service';
import { UpsertFeatureGateDto } from './dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('feature-gates')
export class FeatureGateController {
  constructor(private readonly service: FeatureGateService) {}

  @Get()
  @Roles('admin')
  list() {
    return this.service.list();
  }

  @Post(':name')
  @Roles('admin')
  upsert(
    @Param('name') name: string,
    @Body() body: UpsertFeatureGateDto,
  ) {
    return this.service.upsert(name, body);
  }

  @Delete(':name')
  @Roles('admin')
  delete(@Param('name') name: string) {
    return this.service.delete(name);
  }
}

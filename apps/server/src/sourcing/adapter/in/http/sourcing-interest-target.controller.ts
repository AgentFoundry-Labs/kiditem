import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { SourcingInterestTargetService } from '../../../application/service/sourcing-interest-target.service';
import { UpsertSourcingInterestTargetDto } from './dto';

@Controller('sourcing/workspace/interests')
export class SourcingInterestTargetController {
  constructor(private readonly interests: SourcingInterestTargetService) {}

  @Get()
  list(@CurrentOrganization() organizationId: string) {
    return this.interests.list(organizationId);
  }

  @Post()
  upsert(
    @Body() body: UpsertSourcingInterestTargetDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.interests.upsert({ organizationId, ...body });
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    await this.interests.remove({ organizationId, id });
  }
}

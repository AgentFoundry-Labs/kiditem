import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
} from '@nestjs/common';
import { UpsertOperationScheduleRequestSchema } from '@kiditem/shared/operations';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { OperationSchedulerService } from '../../../application/service/operation-scheduler.service';

@Controller('operation-schedules')
export class OperationSchedulesController {
  constructor(private readonly scheduler: OperationSchedulerService) {}

  @Get()
  async list(@CurrentOrganization() organizationId: string) {
    return { items: await this.scheduler.list(organizationId) };
  }

  @Put(':operationKey')
  @Roles('owner', 'admin')
  upsert(
    @Param('operationKey') operationKey: string,
    @Body() body: unknown,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const parsed = UpsertOperationScheduleRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_operation_schedule');
    return this.scheduler.upsert({
      organizationId,
      operationKey,
      userId: user.id,
      request: parsed.data,
    });
  }

  @Delete(':operationKey')
  @Roles('owner', 'admin')
  disable(
    @Param('operationKey') operationKey: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.scheduler.disable(organizationId, operationKey);
  }
}

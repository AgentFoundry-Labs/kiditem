import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ManagerService } from '../../../application/service/agent/manager.service';
import {
  ListConversationsQueryDto,
  ManagerAskBodyDto,
} from './dto/manager';

@Controller('manager')
export class ManagerController {
  constructor(
    private readonly managerService: ManagerService,
  ) {}

  @Post('ask')
  ask(@Body() body: ManagerAskBodyDto, @CurrentOrganization() organizationId: string) {
    return this.managerService.ask({ ...body, organizationId });
  }

  @Get('conversations')
  getConversations(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.managerService.getConversations(organizationId, query.limit);
  }
}

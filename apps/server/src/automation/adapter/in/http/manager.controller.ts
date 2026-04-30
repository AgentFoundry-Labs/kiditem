import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';
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
  ask(@Body() body: ManagerAskBodyDto, @CurrentCompany() companyId: string) {
    return this.managerService.ask({ ...body, companyId });
  }

  @Get('conversations')
  getConversations(
    @CurrentCompany() companyId: string,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.managerService.getConversations(companyId, query.limit);
  }
}

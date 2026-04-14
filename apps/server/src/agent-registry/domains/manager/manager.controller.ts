import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { ManagerService } from './manager.service';
import {
  ManagerAskBodyDto,
  ListConversationsQueryDto,
} from './dto';
import { CurrentCompany } from '../../../auth/decorators/current-company.decorator';

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

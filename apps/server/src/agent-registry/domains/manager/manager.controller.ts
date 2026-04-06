import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { ManagerService } from './manager.service';
import {
  ManagerAskBodyDto,
  ListConversationsQueryDto,
} from './dto';

@Controller('manager')
export class ManagerController {
  constructor(
    private readonly managerService: ManagerService,
  ) {}

  @Post('ask')
  ask(@Body() body: ManagerAskBodyDto) {
    return this.managerService.ask(body);
  }

  @Get('conversations')
  getConversations(@Query() query: ListConversationsQueryDto) {
    return this.managerService.getConversations(query.companyId, query.limit);
  }
}

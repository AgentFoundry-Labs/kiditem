import { Controller, Post, Get, Body, Query, Param } from '@nestjs/common';
import { ManagerService } from './manager.service';

@Controller('manager')
export class ManagerController {
  constructor(private readonly managerService: ManagerService) {}

  @Post('ask')
  ask(
    @Body()
    body: {
      companyId: string;
      request: string;
      productId?: string;
      context?: Record<string, unknown>;
    },
  ) {
    return this.managerService.ask(body);
  }

  @Post('results/:taskId')
  receiveResults(
    @Param('taskId') taskId: string,
    @Body() body: {
      answer?: string;
      data?: Record<string, unknown>;
      recommendations?: any[];
      tokensUsed?: number;
    },
  ) {
    return this.managerService.receiveResults(taskId, body);
  }

  @Get('conversations')
  getConversations(
    @Query('companyId') companyId: string,
    @Query('limit') limit?: string,
  ) {
    return this.managerService.getConversations(
      companyId,
      limit ? parseInt(limit) : undefined,
    );
  }
}

import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { RulesService } from './rules.service';
import { RulesSchedulerService } from './rules-scheduler.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('rules')
export class RulesController {
  constructor(
    private readonly rulesService: RulesService,
    private readonly schedulerService: RulesSchedulerService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveCompanyId(companyId?: string): Promise<string> {
    if (companyId) return companyId;
    const first = await this.prisma.company.findFirst({ select: { id: true } });
    if (!first) throw new Error('No company found');
    return first.id;
  }

  @Post('evaluate')
  async evaluate(@Query('companyId') companyId?: string) {
    return this.rulesService.evaluateAll(await this.resolveCompanyId(companyId));
  }

  @Get('summary')
  async summary(@Query('companyId') companyId?: string) {
    return this.rulesService.getSummary(await this.resolveCompanyId(companyId));
  }

  @Get()
  async findAll(
    @Query('companyId') companyId?: string,
    @Query('category') category?: string,
  ) {
    return this.rulesService.findAllRules(
      await this.resolveCompanyId(companyId),
      category,
    );
  }

  @Get('schedule')
  async getSchedule() {
    const schedule = await this.schedulerService.getSchedule();
    const options = this.schedulerService.getScheduleOptions();
    return { schedule, options };
  }

  @Patch('schedule')
  updateSchedule(@Body() body: { schedule: string }) {
    return this.schedulerService.setSchedule(body.schedule);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { threshold?: unknown; active?: boolean; autoExecute?: boolean },
  ) {
    return this.rulesService.updateRule(id, body);
  }

  @Post('reload')
  reload() {
    return this.rulesService.reloadRules();
  }
}

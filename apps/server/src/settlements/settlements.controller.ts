import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettlementsService } from './settlements.service';
import { ListSettlementsQueryDto, CreateSettlementDto, UpdateSettlementDto, ReconcileSettlementDto } from './dto';

@Controller('settlements')
export class SettlementsController {
  constructor(
    private readonly settlementsService: SettlementsService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveCompanyId(companyId?: string): Promise<string> {
    if (companyId) return companyId;
    const first = await this.prisma.company.findFirst({ select: { id: true } });
    if (!first) throw new Error('No company found');
    return first.id;
  }

  @Get()
  async findAll(@Query() query: ListSettlementsQueryDto) {
    return this.settlementsService.findAll(
      await this.resolveCompanyId(query.companyId),
    );
  }

  @Post()
  create(@Body() dto: CreateSettlementDto) {
    return this.settlementsService.create(dto);
  }

  @Post('reconcile')
  async reconcile(@Body() dto: ReconcileSettlementDto) {
    const companyId = await this.resolveCompanyId(dto.companyId);
    return this.settlementsService.reconcile(companyId, dto.period);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSettlementDto) {
    return this.settlementsService.update(id, dto);
  }
}

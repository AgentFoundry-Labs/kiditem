import { Controller, Get, Post, Delete, Param, Query, Body } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManualLedgerService } from './manual-ledger.service';
import { ListManualLedgerQueryDto, CreateManualLedgerDto } from './dto';

@Controller('manual-ledger')
export class ManualLedgerController {
  constructor(
    private readonly manualLedgerService: ManualLedgerService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveCompanyId(companyId?: string): Promise<string> {
    if (companyId) return companyId;
    const first = await this.prisma.company.findFirst({ select: { id: true } });
    if (!first) throw new Error('No company found');
    return first.id;
  }

  @Get()
  async findAll(@Query() query: ListManualLedgerQueryDto) {
    return this.manualLedgerService.findAll(
      await this.resolveCompanyId(query.companyId),
      query.type,
      query.period,
    );
  }

  @Post()
  create(@Body() dto: CreateManualLedgerDto) {
    return this.manualLedgerService.create(dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.manualLedgerService.delete(id);
  }
}

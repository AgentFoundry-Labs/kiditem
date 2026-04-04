import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProcessingCostsService } from './processing-costs.service';
import { ListProcessingCostsQueryDto, CreateProcessingCostDto, UpdateProcessingCostDto } from './dto';

@Controller('processing-costs')
export class ProcessingCostsController {
  constructor(
    private readonly processingCostsService: ProcessingCostsService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveCompanyId(companyId?: string): Promise<string> {
    if (companyId) return companyId;
    const first = await this.prisma.company.findFirst({ select: { id: true } });
    if (!first) throw new Error('No company found');
    return first.id;
  }

  @Get()
  async findAll(@Query() query: ListProcessingCostsQueryDto) {
    return this.processingCostsService.findAll(
      await this.resolveCompanyId(query.companyId),
      query.status,
    );
  }

  @Get('monthly')
  async monthly(@Query() query: ListProcessingCostsQueryDto) {
    return this.processingCostsService.monthly(
      await this.resolveCompanyId(query.companyId),
    );
  }

  @Post()
  create(@Body() dto: CreateProcessingCostDto) {
    return this.processingCostsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProcessingCostDto) {
    return this.processingCostsService.update(id, dto);
  }
}

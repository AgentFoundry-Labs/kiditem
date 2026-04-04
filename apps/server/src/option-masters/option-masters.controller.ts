import { Controller, Get, Post, Patch, Delete, Param, Query, Body } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OptionMastersService } from './option-masters.service';
import { CreateOptionMasterDto, UpdateOptionMasterDto } from './dto';

@Controller('option-masters')
export class OptionMastersController {
  constructor(
    private readonly optionMastersService: OptionMastersService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveCompanyId(companyId?: string): Promise<string> {
    if (companyId) return companyId;
    const first = await this.prisma.company.findFirst({ select: { id: true } });
    if (!first) throw new Error('No company found');
    return first.id;
  }

  @Get()
  async findAll(@Query('companyId') companyId?: string) {
    return this.optionMastersService.findAll(await this.resolveCompanyId(companyId));
  }

  @Post()
  create(@Body() dto: CreateOptionMasterDto) {
    return this.optionMastersService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOptionMasterDto) {
    return this.optionMastersService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.optionMastersService.delete(id);
  }
}

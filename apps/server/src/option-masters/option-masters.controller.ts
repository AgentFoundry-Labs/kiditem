import { Controller, Get, Post, Patch, Delete, Param, Query, Body } from '@nestjs/common';
import { CompanyResolverService } from '../common/company-resolver.service';
import { OptionMastersService } from './option-masters.service';
import { CreateOptionMasterDto, UpdateOptionMasterDto } from './dto';

@Controller('option-masters')
export class OptionMastersController {
  constructor(
    private readonly optionMastersService: OptionMastersService,
    private readonly companyResolver: CompanyResolverService,
  ) {}

  @Get()
  async findAll(@Query('companyId') companyId?: string) {
    return this.optionMastersService.findAll(await this.companyResolver.resolve());
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

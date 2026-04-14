import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { OptionMastersService } from './option-masters.service';
import { CreateOptionMasterDto, UpdateOptionMasterDto } from './dto';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';

@Controller('option-masters')
export class OptionMastersController {
  constructor(private readonly optionMastersService: OptionMastersService) {}

  @Get()
  async findAll(@CurrentCompany() companyId: string) {
    return this.optionMastersService.findAll(companyId);
  }

  @Post()
  create(@Body() dto: CreateOptionMasterDto, @CurrentCompany() companyId: string) {
    return this.optionMastersService.create(companyId, dto);
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

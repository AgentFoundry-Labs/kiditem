import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { ReturnTransfersService } from './return-transfers.service';
import { ListReturnTransfersQueryDto, CreateReturnTransferDto, UpdateReturnTransferDto } from './dto';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';

@Controller('return-transfers')
export class ReturnTransfersController {
  constructor(private readonly returnTransfersService: ReturnTransfersService) {}

  @Get()
  findAll(@CurrentCompany() companyId: string, @Query() query: ListReturnTransfersQueryDto) {
    return this.returnTransfersService.findAll(companyId, query);
  }

  @Post()
  create(@Body() dto: CreateReturnTransferDto, @CurrentCompany() companyId: string) {
    return this.returnTransfersService.create(companyId, dto);
  }

  @Patch(':id')
  update(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateReturnTransferDto,
  ) {
    return this.returnTransfersService.update(id, dto, companyId);
  }
}

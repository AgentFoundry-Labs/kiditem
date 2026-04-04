import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { ReturnTransfersService } from './return-transfers.service';
import { ListReturnTransfersQueryDto, CreateReturnTransferDto, UpdateReturnTransferDto } from './dto';

@Controller('return-transfers')
export class ReturnTransfersController {
  constructor(private readonly returnTransfersService: ReturnTransfersService) {}

  @Get()
  findAll(@Query() query: ListReturnTransfersQueryDto) {
    return this.returnTransfersService.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateReturnTransferDto) {
    return this.returnTransfersService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateReturnTransferDto) {
    return this.returnTransfersService.update(id, dto);
  }
}

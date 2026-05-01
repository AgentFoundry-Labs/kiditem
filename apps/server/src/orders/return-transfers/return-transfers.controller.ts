import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { ReturnTransfersService } from './return-transfers.service';
import { ListReturnTransfersQueryDto, CreateReturnTransferDto, UpdateReturnTransferDto } from './dto';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';

@Controller('return-transfers')
export class ReturnTransfersController {
  constructor(private readonly returnTransfersService: ReturnTransfersService) {}

  @Get()
  findAll(@CurrentOrganization() organizationId: string, @Query() query: ListReturnTransfersQueryDto) {
    return this.returnTransfersService.findAll(organizationId, query);
  }

  @Post()
  create(@Body() dto: CreateReturnTransferDto, @CurrentOrganization() organizationId: string) {
    return this.returnTransfersService.create(organizationId, dto);
  }

  @Patch(':id')
  update(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateReturnTransferDto,
  ) {
    return this.returnTransfersService.update(id, dto, organizationId);
  }
}

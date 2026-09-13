import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ReturnsService } from '../services/returns.service';
import { ListReturnsQueryDto, ReturnActionBodyDto } from '../dto';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  findAll(@CurrentOrganization() organizationId: string, @Query() query: ListReturnsQueryDto) {
    return this.returnsService.findAll(organizationId, query);
  }

  @Get('stats')
  getStats(@CurrentOrganization() organizationId: string) {
    return this.returnsService.getStats(organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.returnsService.findOne(id, organizationId);
  }

  @Post()
  async handleAction(
    @Body() body: ReturnActionBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.returnsService.approve(body.receiptId, organizationId);
  }
}

import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import { ListSettlementsQueryDto, CreateSettlementDto, UpdateSettlementDto, ReconcileSettlementDto } from './dto';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';

@Controller('settlements')
export class SettlementsController {
  constructor(
    private readonly settlementsService: SettlementsService,
  ) {}

  @Get()
  async findAll(
    @CurrentCompany() companyId: string,
    @Query() query: ListSettlementsQueryDto,
  ) {
    return this.settlementsService.findAll(companyId, query.period);
  }

  @Post()
  create(@Body() dto: CreateSettlementDto, @CurrentCompany() companyId: string) {
    return this.settlementsService.create(companyId, dto);
  }

  @Post('reconcile')
  async reconcile(
    @Body() dto: ReconcileSettlementDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.settlementsService.reconcile(companyId, dto.period);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() dto: UpdateSettlementDto,
  ) {
    return this.settlementsService.update(id, companyId, dto);
  }
}

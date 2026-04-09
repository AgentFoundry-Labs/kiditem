import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { CompanyResolverService } from '../common/company-resolver.service';
import { SettlementsService } from './settlements.service';
import { ListSettlementsQueryDto, CreateSettlementDto, UpdateSettlementDto, ReconcileSettlementDto } from './dto';

@Controller('settlements')
export class SettlementsController {
  constructor(
    private readonly settlementsService: SettlementsService,
    private readonly companyResolver: CompanyResolverService,
  ) {}

  @Get()
  async findAll(@Query() query: ListSettlementsQueryDto) {
    return this.settlementsService.findAll(
      await this.companyResolver.resolve(),
    );
  }

  @Post()
  create(@Body() dto: CreateSettlementDto) {
    return this.settlementsService.create(dto);
  }

  @Post('reconcile')
  async reconcile(@Body() dto: ReconcileSettlementDto) {
    const companyId = await this.companyResolver.resolve();
    return this.settlementsService.reconcile(companyId, dto.period);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSettlementDto) {
    return this.settlementsService.update(id, dto);
  }
}

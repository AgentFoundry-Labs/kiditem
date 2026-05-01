import { Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  AUDITS_PORT,
  type AuditsPort,
} from '../../../application/port/in/audits.port';
import { CreateStockAuditDto, UpdateStockAuditDto } from './dto';

// Route stays `/api/stock-audits/*` even though the file is now
// `audits.controller.ts` — capability owns route shape (Phase 3B contract).
@Controller('stock-audits')
export class AuditsController {
  constructor(
    @Inject(AUDITS_PORT) private readonly audits: AuditsPort,
  ) {}

  @Get()
  findAll(@CurrentOrganization() organizationId: string) {
    return this.audits.findAll(organizationId);
  }

  @Post()
  create(@Body() dto: CreateStockAuditDto, @CurrentOrganization() organizationId: string) {
    return this.audits.create(organizationId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStockAuditDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.audits.update(id, organizationId, dto);
  }
}

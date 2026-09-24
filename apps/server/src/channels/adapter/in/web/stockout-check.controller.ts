import { Body, Controller, Inject, Post, UseFilters, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { STOCKOUT_CHECK_PORT, type StockoutCheckPort } from '../../../application/port/in/listing/stockout-check.port';
import { ChannelBusinessExceptionFilter } from './channel-business-exception.filter';

const PreviewSchema = z.object({ listingIds: z.array(z.string().uuid()).min(1).max(1000) }).strict();
const PrepareSchema = z.object({ listingId: z.string().uuid(), idempotencyKey: z.string().trim().min(1).max(200) }).strict();

@Controller('channels/stockout-checks')
@UseFilters(ChannelBusinessExceptionFilter)
export class StockoutCheckController {
  constructor(@Inject(STOCKOUT_CHECK_PORT) private readonly stockout: StockoutCheckPort) {}
  @Post('preview')
  preview(@CurrentOrganization() organizationId: string, @Body() body: unknown) {
    const parsed = PreviewSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid stockout preview request.');
    return this.stockout.preview(organizationId, parsed.data.listingIds);
  }
  @Post('prepare')
  prepare(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser, @Body() body: unknown) {
    const parsed = PrepareSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid stockout preparation request.');
    return this.stockout.prepare(organizationId, user.id ?? null, parsed.data);
  }
}

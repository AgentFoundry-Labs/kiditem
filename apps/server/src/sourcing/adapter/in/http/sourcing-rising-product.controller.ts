import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { SourcingRisingProductService } from '../../../application/service/sourcing-rising-product.service';

const DetectionInputSchema = z.object({
  windowDays: z.number().int().min(2).max(60).optional(),
  limit: z.number().int().min(1).max(200).optional(),
}).strict();

@Controller('sourcing/rising-products')
export class SourcingRisingProductController {
  constructor(private readonly rising: SourcingRisingProductService) {}

  @Get()
  latest(@CurrentOrganization() organizationId: string) {
    return this.rising.getLatest(organizationId);
  }

  @Post()
  detect(@CurrentOrganization() organizationId: string, @Body() input: unknown) {
    const parsed = DetectionInputSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('INVALID_RISING_PRODUCT_INPUT');
    return this.rising.detect({ ...parsed.data, organizationId });
  }
}

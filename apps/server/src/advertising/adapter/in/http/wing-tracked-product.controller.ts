import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  WingTrackedProductService,
  type WingTrackedSnapshotValuesInput,
} from '../../../application/service/wing-tracked-product.service';
import {
  AddWingTrackedProductDto,
  WingTrackedHistoryQueryDto,
} from './dto';

const AttemptStartSchema = z.object({
  keywords: z.array(z.string().trim().min(1).max(100)).min(1).max(12),
}).strict();

const SnapshotItemSchema = z.object({
  productId: z.string().trim().min(1).max(40),
  sourceKeyword: z.string().trim().min(1).max(100).nullable().optional(),
  salePriceKrw: z.number().finite().nonnegative().nullable().optional(),
  ratingCount: z.number().finite().nonnegative().nullable().optional(),
  ratingAverage: z.number().finite().min(0).max(5).nullable().optional(),
  pvLast28Day: z.number().finite().nonnegative().nullable().optional(),
  salesLast28d: z.number().finite().nonnegative().nullable().optional(),
  estimatedRevenue28d: z.number().finite().nonnegative().nullable().optional(),
  conversionRate28d: z.number().finite().min(0).max(1).nullable().optional(),
}).strict();

const AttemptSubmitSchema = z.object({
  items: z.array(SnapshotItemSchema).max(300),
}).strict();

const AttemptFailureSchema = z.object({
  code: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(300),
}).strict();

@Controller('ads/wing-tracked-products')
export class WingTrackedProductController {
  constructor(private readonly service: WingTrackedProductService) {}

  @Get()
  list(@CurrentOrganization() organizationId: string) {
    return this.service.list(organizationId);
  }

  @Post()
  add(
    @Body() body: AddWingTrackedProductDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.addTracker(
      {
        productId: body.productId,
        itemId: body.itemId ?? null,
        vendorItemId: body.vendorItemId ?? null,
        productName: body.productName,
        imagePath: body.imagePath ?? null,
        brandName: body.brandName ?? null,
        categoryHierarchy: body.categoryHierarchy ?? null,
        sourceKeyword: body.sourceKeyword ?? null,
        ...metricsFromDto(body),
      },
      organizationId,
    );
  }

  @Post('attempts')
  beginAttempt(
    @Body() rawBody: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentOrganization() organizationId: string,
  ) {
    const body = AttemptStartSchema.safeParse(rawBody);
    if (!body.success) throw new BadRequestException('INVALID_WING_TRACKED_ATTEMPT');
    return this.service.beginAttempt({
      organizationId,
      idempotencyKey: headerText(idempotencyKey, 'INVALID_IDEMPOTENCY_KEY'),
      keywords: body.data.keywords,
    });
  }

  @Get('attempts/current')
  readSourceStatus(@CurrentOrganization() organizationId: string) {
    return this.service.readSourceStatus(organizationId);
  }

  @Get('attempts/:attemptId')
  readAttemptControl(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.readAttemptControl({ organizationId, attemptId });
  }

  @Put('attempts/:attemptId')
  submitAttempt(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') rawAttemptToken: string | undefined,
    @Body() rawBody: unknown,
    @CurrentOrganization() organizationId: string,
  ) {
    const body = AttemptSubmitSchema.safeParse(rawBody);
    if (!body.success) throw new BadRequestException('INVALID_WING_TRACKED_SNAPSHOT');
    return this.service.submitAttempt({
      organizationId,
      attemptId,
      attemptToken: attemptToken(rawAttemptToken),
      items: body.data.items.map((item) => ({
        productId: item.productId,
        sourceKeyword: item.sourceKeyword ?? null,
        salePriceKrw: item.salePriceKrw ?? null,
        ratingCount: item.ratingCount ?? null,
        ratingAverage: item.ratingAverage ?? null,
        pvLast28Day: item.pvLast28Day ?? null,
        salesLast28d: item.salesLast28d ?? null,
      estimatedRevenue28d: item.estimatedRevenue28d ?? null,
      conversionRate28d: item.conversionRate28d ?? null,
    })),
    });
  }

  @Post('attempts/:attemptId/fail')
  failAttempt(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') rawAttemptToken: string | undefined,
    @Body() rawBody: unknown,
    @CurrentOrganization() organizationId: string,
  ) {
    const body = AttemptFailureSchema.safeParse(rawBody);
    if (!body.success) throw new BadRequestException('INVALID_WING_TRACKED_FAILURE');
    return this.service.failAttempt({
      organizationId,
      attemptId,
      attemptToken: attemptToken(rawAttemptToken),
      ...body.data,
    });
  }

  @Get('history')
  historyBulk(
    @Query() query: WingTrackedHistoryQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.getBulkHistory(query.days ?? 30, organizationId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.remove(id, organizationId);
  }

  @Get(':id/history')
  history(
    @Param('id') id: string,
    @Query() query: WingTrackedHistoryQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.getHistory(id, query.days ?? 30, organizationId);
  }
}

function metricsFromDto(dto: {
  salePriceKrw?: number | null;
  ratingCount?: number | null;
  ratingAverage?: number | null;
  pvLast28Day?: number | null;
  salesLast28d?: number | null;
  estimatedRevenue28d?: number | null;
  conversionRate28d?: number | null;
}): WingTrackedSnapshotValuesInput {
  return {
    salePriceKrw: dto.salePriceKrw ?? null,
    ratingCount: dto.ratingCount ?? null,
    ratingAverage: dto.ratingAverage ?? null,
    pvLast28Day: dto.pvLast28Day ?? null,
    salesLast28d: dto.salesLast28d ?? null,
    estimatedRevenue28d: dto.estimatedRevenue28d ?? null,
    conversionRate28d: dto.conversionRate28d ?? null,
  };
}

function attemptToken(value: string | undefined): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw new BadRequestException('INVALID_SOURCE_ATTEMPT_TOKEN');
  return parsed.data;
}

function headerText(value: string | undefined, code: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 128) {
    throw new BadRequestException(code);
  }
  return value.trim();
}

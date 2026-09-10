import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ReviewIngestItemSchema } from '@kiditem/shared/reviews';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/auth.types';
import {
  REVIEW_COLLECTION_SOURCE_PORT,
  type ReviewCollectionSourcePort,
  type ReviewCollectionWindowCompletion,
} from '../application/port/in/review-collection-source.port';
import { ListReviewItemsQueryDto } from '../dto/list-review-items.dto';
import { ListReviewsQueryDto } from '../dto/list-reviews.dto';
import { ReviewsService } from '../services/reviews.service';

// NOTE: no `@UseGuards`/`@UsePipes` — global APP_GUARD (OrganizationScopeGuard)
// + global ValidationPipe handle the read DTOs. Owner write bodies are parsed
// explicitly because their attempt fence is part of the source contract.
@Controller('reviews')
export class ReviewsController {
  constructor(
    private readonly svc: ReviewsService,
    @Inject(REVIEW_COLLECTION_SOURCE_PORT)
    private readonly source: ReviewCollectionSourcePort,
  ) {}

  @Get()
  async list(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListReviewsQueryDto,
  ) {
    return this.svc.list(organizationId, query);
  }

  @Get('items')
  async listItems(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListReviewItemsQueryDto,
  ) {
    return this.svc.listItems(organizationId, query);
  }

  @Post('attempts')
  beginAttempt(
    @Body() rawBody: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.source.beginAttempt({
      organizationId,
      userId: user.id,
      idempotencyKey: requireHeader(idempotencyKey, 'INVALID_IDEMPOTENCY_KEY'),
      months: parseMonths(rawBody),
    });
  }

  @Get('attempts/:attemptId')
  async readAttempt(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    const attempt = await this.source.readAttempt({ organizationId, attemptId });
    if (!attempt) throw new NotFoundException('REVIEW_COLLECTION_ATTEMPT_NOT_FOUND');
    return attempt;
  }

  @Get('attempts/:attemptId/control')
  async readAttemptControl(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    const control = await this.source.readAttemptControl({ organizationId, attemptId });
    if (!control) throw new NotFoundException('REVIEW_COLLECTION_ATTEMPT_NOT_FOUND');
    return control;
  }

  @Post('attempts/:attemptId/chunks')
  appendChunk(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @CurrentOrganization() organizationId: string,
    @Body() rawBody: unknown,
  ) {
    const body = parseChunkBody(rawBody);
    return this.source.appendChunk({
      organizationId,
      attemptId,
      attemptToken: requireUuidHeader(attemptToken),
      receipt: body,
    });
  }

  @Post('attempts/:attemptId/windows/:windowIndex/complete')
  completeWindow(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Param('windowIndex') windowIndex: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @CurrentOrganization() organizationId: string,
    @Body() rawBody: unknown,
  ) {
    const completion = parseWindowCompletion(rawBody, windowIndex);
    return this.source.completeWindow({
      organizationId,
      attemptId,
      attemptToken: requireUuidHeader(attemptToken),
      completion,
    });
  }

  @Post('attempts/:attemptId/complete')
  completeAttempt(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.source.completeAttempt({
      organizationId,
      attemptId,
      attemptToken: requireUuidHeader(attemptToken),
    });
  }

  @Post('attempts/:attemptId/fail')
  failAttempt(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @CurrentOrganization() organizationId: string,
    @Body() rawBody: unknown,
  ) {
    const body = parseFailureBody(rawBody);
    return this.source.failAttempt({
      organizationId,
      attemptId,
      attemptToken: requireUuidHeader(attemptToken),
      ...body,
    });
  }

  @Post('attempts/:attemptId/cancel')
  cancelAttempt(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.source.cancelAttempt({
      organizationId,
      attemptId,
      attemptToken: requireUuidHeader(attemptToken),
    });
  }
}

function parseMonths(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('INVALID_REVIEW_COLLECTION_MONTHS');
  }
  const months = (value as Record<string, unknown>).months;
  if (typeof months !== 'number' || !Number.isSafeInteger(months)) {
    throw new BadRequestException('INVALID_REVIEW_COLLECTION_MONTHS');
  }
  return months;
}

function parseChunkBody(value: unknown): {
  windowIndex: number;
  sequence: number;
  items: ReturnType<typeof ReviewIngestItemSchema.parse>[];
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('INVALID_REVIEW_COLLECTION_CHUNK');
  }
  const body = value as Record<string, unknown>;
  const windowIndex = body.windowIndex;
  const sequence = body.sequence;
  if (
    typeof windowIndex !== 'number' || !Number.isSafeInteger(windowIndex) ||
    typeof sequence !== 'number' || !Number.isSafeInteger(sequence)
  ) {
    throw new BadRequestException('INVALID_REVIEW_COLLECTION_CHUNK');
  }
  const parsed = ReviewIngestItemSchema.array().max(200).safeParse(body.items);
  if (!parsed.success || parsed.data.length === 0) {
    throw new BadRequestException('INVALID_REVIEW_COLLECTION_CHUNK');
  }
  return { windowIndex, sequence, items: parsed.data };
}

function parseWindowCompletion(
  value: unknown,
  windowIndexValue: string,
): ReviewCollectionWindowCompletion {
  const windowIndex = Number(windowIndexValue);
  if (!Number.isSafeInteger(windowIndex) || windowIndex < 0) {
    throw new BadRequestException('INVALID_REVIEW_COLLECTION_WINDOW');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('INVALID_REVIEW_COLLECTION_WINDOW');
  }
  const body = value as Record<string, unknown>;
  const itemCount = body.itemCount;
  const pageCount = body.pageCount;
  if (
    typeof itemCount !== 'number' || !Number.isSafeInteger(itemCount) ||
    typeof pageCount !== 'number' || !Number.isSafeInteger(pageCount) ||
    typeof body.pageLimitReached !== 'boolean'
  ) {
    throw new BadRequestException('INVALID_REVIEW_COLLECTION_WINDOW');
  }
  return {
    windowIndex,
    itemCount,
    pageCount,
    pageLimitReached: body.pageLimitReached,
  };
}

function parseFailureBody(value: unknown): { errorCode: string; errorMessage: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('INVALID_REVIEW_COLLECTION_FAILURE');
  }
  const body = value as Record<string, unknown>;
  const errorCode = text(body.errorCode);
  const errorMessage = text(body.errorMessage);
  if (!errorCode || !errorMessage || errorCode.length > 80 || errorMessage.length > 500) {
    throw new BadRequestException('INVALID_REVIEW_COLLECTION_FAILURE');
  }
  return { errorCode, errorMessage };
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result || null;
}

function requireHeader(value: string | undefined, code: string): string {
  const result = text(value);
  if (!result || result.length > 128) throw new BadRequestException(code);
  return result;
}

function requireUuidHeader(value: string | undefined): string {
  const result = text(value);
  if (!result || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new BadRequestException('INVALID_SOURCE_ATTEMPT_TOKEN');
  }
  return result;
}

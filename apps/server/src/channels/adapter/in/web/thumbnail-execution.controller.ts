import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseFilters } from '@nestjs/common';
import {
  ThumbnailExecutionPrepareRequestSchema,
  ThumbnailExecutionReportRequestSchema,
  ThumbnailExecutionStatusQuerySchema,
} from '@kiditem/shared/thumbnail-execution';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import {
  CHANNELS_THUMBNAIL_EXECUTION_PORT,
  type ChannelsThumbnailExecutionPort,
} from '../../../application/port/in/thumbnail-execution.port';
import { ChannelBusinessExceptionFilter } from './channel-business-exception.filter';

/** 대표이미지 몰 반영 — 확장 경로의 준비 · 보고 · 다시 보내기, 운영자 표시, 상태 읽기 · 실패 치우기. */
@UseFilters(ChannelBusinessExceptionFilter)
@Controller('channels/thumbnail-executions')
export class ThumbnailExecutionController {
  constructor(@Inject(CHANNELS_THUMBNAIL_EXECUTION_PORT) private readonly executions: ChannelsThumbnailExecutionPort) {}

  @Post()
  async prepare(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser, @Body() body: unknown) {
    const parsed = ThumbnailExecutionPrepareRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.executions.prepare({ organizationId, requestedByUserId: user?.id ?? null, ...parsed.data });
  }

  @Post(':executionId/report')
  async report(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('executionId', new ParseUUIDPipe()) executionId: string,
    @Body() body: unknown,
  ) {
    const parsed = ThumbnailExecutionReportRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.executions.report({ organizationId, requestedByUserId: user?.id ?? null, executionId, report: parsed.data });
  }

  /** 결과를 모르는 실행의 동결 사진을 확장에 다시 보내려고 받는다. 보고는 `report` 로 한다. */
  @Post(':executionId/resend')
  resend(@CurrentOrganization() organizationId: string, @Param('executionId', new ParseUUIDPipe()) executionId: string) {
    return this.executions.resend({ organizationId, executionId });
  }

  /** 운영자의 "반영됨으로 표시" — Wing 에서 저장한 것을 확인했다. 성공으로 가는 유일한 길이다. */
  @Post(':executionId/applied')
  confirmApplied(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('executionId', new ParseUUIDPipe()) executionId: string,
  ) {
    return this.executions.confirmApplied({ organizationId, requestedByUserId: user?.id ?? null, executionId });
  }

  /** 운영자의 "반영 안 됨으로 표시" — 살아 있는 실행을 실패로 끝내 새 반영을 연다. */
  @Post(':executionId/not-applied')
  markNotApplied(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('executionId', new ParseUUIDPipe()) executionId: string,
  ) {
    return this.executions.markNotApplied({ organizationId, requestedByUserId: user?.id ?? null, executionId });
  }

  /** 판매상품에 쿠팡 listing 이 여럿일 때 운영자가 고를 목록. */
  @Get('listing-choices')
  async listingChoices(
    @CurrentOrganization() organizationId: string,
    @Query('generationId', new ParseUUIDPipe()) generationId: string,
  ) {
    return { items: await this.executions.listingChoices({ organizationId, generationId }) };
  }

  @Get()
  async listLatest(@CurrentOrganization() organizationId: string, @Query('generationIds') generationIds: string | undefined) {
    const parsed = ThumbnailExecutionStatusQuerySchema.safeParse({
      generationIds: (generationIds ?? '').split(',').map((id) => id.trim()).filter(Boolean),
    });
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return { items: await this.executions.listLatest({ organizationId, generationIds: parsed.data.generationIds }) };
  }

  @Delete('failed/:generationId')
  dismissFailed(@CurrentOrganization() organizationId: string, @Param('generationId', new ParseUUIDPipe()) generationId: string) {
    return this.executions.dismissFailed({ organizationId, generationId });
  }
}

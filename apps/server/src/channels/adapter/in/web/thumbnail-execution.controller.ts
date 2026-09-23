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

/** 대표이미지 몰 반영 — 확장 경로의 준비 · 보고와 화면의 상태 읽기 · 실패 치우기. */
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

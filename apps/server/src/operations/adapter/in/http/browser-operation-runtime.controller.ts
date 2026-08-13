import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  BrowserOperationClaimRequestSchema,
  BrowserOperationHeartbeatRequestSchema,
  BrowserOperationReportRequestSchema,
} from '@kiditem/shared/operations';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { BrowserOperationRuntimeService } from '../../../application/service/browser-operation-runtime.service';

@Controller('operation-runtime/browser')
export class BrowserOperationRuntimeController {
  constructor(private readonly runtime: BrowserOperationRuntimeService) {}

  @Post('claim')
  @HttpCode(HttpStatus.OK)
  async claim(
    @Body() body: unknown,
    @CurrentOrganization() organizationId: string,
  ) {
    const parsed = BrowserOperationClaimRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_browser_runtime_claim');
    return { claim: await this.runtime.claim({ organizationId, ...parsed.data }) };
  }

  @Post('runs/:runId/heartbeat')
  @HttpCode(HttpStatus.NO_CONTENT)
  async heartbeat(
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @Body() body: unknown,
    @CurrentOrganization() organizationId: string,
  ): Promise<void> {
    const parsed = BrowserOperationHeartbeatRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_browser_runtime_heartbeat');
    await this.runtime.heartbeat({ organizationId, runId, request: parsed.data });
  }

  @Post('runs/:runId/report')
  @HttpCode(HttpStatus.NO_CONTENT)
  async report(
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @Body() body: unknown,
    @CurrentOrganization() organizationId: string,
  ): Promise<void> {
    const parsed = BrowserOperationReportRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid_browser_runtime_report');
    await this.runtime.report({ organizationId, runId, ...parsed.data });
  }

  @Post('runs/:runId/retry')
  @HttpCode(HttpStatus.NO_CONTENT)
  async retry(
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.runtime.retry({
      organizationId,
      runId,
      requestedByUserId: user.id,
    });
  }
}

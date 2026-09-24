import { PrepareListingAvailabilityInputSchema, ReportListingAvailabilityInputSchema } from '@kiditem/shared/sales-product';
import { BadRequestException, Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { PrepareTargetExecutionInputSchema, ReportTargetExecutionInputSchema } from '@kiditem/shared/sales-product';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { REGISTRATION_EXECUTION_PORT, type RegistrationExecutionPort } from '../../../application/port/in/capability/registration-execution.port';

@Controller('channels')
export class RegistrationTargetExecutionController {
  constructor(@Inject(REGISTRATION_EXECUTION_PORT) private readonly executions: RegistrationExecutionPort) {}

  @Post('listing-availability-executions')
  prepareListing(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser, @Body() body: unknown) {
    const parsed = PrepareListingAvailabilityInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.executions.prepareListingAvailability(organizationId, user.id ?? null, parsed.data);
  }
  @Get('listing-availability-executions')
  listListing(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser,
    @Query('channelAccountId', new ParseUUIDPipe()) accountId: string, @Query('externalListingId') externalId: string) {
    if (!externalId?.trim()) throw new BadRequestException('externalListingId is required.');
    return this.executions.listListingAvailability(organizationId, user.id ?? null, accountId, externalId);
  }
  @Post('listing-availability-executions/:id/start')
  startListing(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.executions.startListingAvailability(organizationId, user.id ?? null, id);
  }
  @Post('listing-availability-executions/:id/result')
  reportListing(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown) {
    const parsed = ReportListingAvailabilityInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.executions.reportListingAvailability(organizationId, user.id ?? null, id, parsed.data);
  }

  @Get('registration-targets/:id/executions')
  list(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) targetId: string) {
    return this.executions.listTargetExecutions(organizationId, targetId, user.id ?? null);
  }

  @Post('registration-targets/:id/executions')
  prepare(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) targetId: string, @Body() body: unknown) {
    const parsed = PrepareTargetExecutionInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.executions.prepareTargetExecution(organizationId, targetId, user.id ?? null, parsed.data);
  }

  @Post('registration-executions/:id/start')
  start(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) executionId: string) {
    return this.executions.startTargetExecution(organizationId, executionId, user.id ?? null);
  }

  @Get('registration-executions/:id')
  get(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) executionId: string) {
    return this.executions.getTargetExecution(organizationId, executionId, user.id ?? null);
  }

  @Post('registration-executions/:id/result')
  report(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) executionId: string, @Body() body: unknown) {
    const parsed = ReportTargetExecutionInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.executions.reportTargetExecution(organizationId, executionId, user.id ?? null, parsed.data);
  }
}


import { UseFilters } from '@nestjs/common';
import { ChannelBusinessExceptionFilter } from './channel-business-exception.filter';
import { PrepareListingAvailabilityInputSchema, ReportListingAvailabilityInputSchema } from '@kiditem/shared/sales-product';
import { BadRequestException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { PrepareTargetExecutionInputSchema, ReportTargetExecutionInputSchema } from '@kiditem/shared/sales-product';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { REGISTRATION_EXECUTION_PORT, type RegistrationExecutionPort } from '../../../application/port/in/capability/registration-execution.port';
import { RegistrationTargetException } from '../../../application/exception/registration-target.exception';

@UseFilters(ChannelBusinessExceptionFilter)
@Controller('channels')
export class RegistrationTargetExecutionController {
  constructor(@Inject(REGISTRATION_EXECUTION_PORT) private readonly executions: RegistrationExecutionPort) {}

  @Post('listing-availability-executions')
  prepareListing(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser, @Body() body: unknown) {
    const parsed = PrepareListingAvailabilityInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return translate(() => this.executions.prepareListingAvailability(organizationId, user.id ?? null, parsed.data));
  }
  @Get('listing-availability-executions')
  listListing(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser,
    @Query('channelAccountId', new ParseUUIDPipe()) accountId: string, @Query('externalListingId') externalId: string) {
    if (!externalId?.trim()) throw new BadRequestException('externalListingId is required.');
    return translate(() => this.executions.listListingAvailability(organizationId, user.id ?? null, accountId, externalId));
  }
  @Post('listing-availability-executions/:id/start')
  startListing(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return translate(() => this.executions.startListingAvailability(organizationId, user.id ?? null, id));
  }
  @Post('listing-availability-executions/:id/result')
  reportListing(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown) {
    const parsed = ReportListingAvailabilityInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return translate(() => this.executions.reportListingAvailability(organizationId, user.id ?? null, id, parsed.data));
  }

  @Get('registration-targets/:id/executions')
  list(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) targetId: string) {
    return translate(() => this.executions.listTargetExecutions(organizationId, targetId, user.id ?? null));
  }

  @Post('registration-targets/:id/executions')
  prepare(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) targetId: string, @Body() body: unknown) {
    const parsed = PrepareTargetExecutionInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return translate(() => this.executions.prepareTargetExecution(organizationId, targetId, user.id ?? null, parsed.data));
  }

  @Post('registration-executions/:id/start')
  start(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) executionId: string) {
    return translate(() => this.executions.startTargetExecution(organizationId, executionId, user.id ?? null));
  }

  @Get('registration-executions/:id')
  get(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) executionId: string) {
    return translate(() => this.executions.getTargetExecution(organizationId, executionId, user.id ?? null));
  }

  @Post('registration-executions/:id/result')
  report(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) executionId: string, @Body() body: unknown) {
    const parsed = ReportTargetExecutionInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return translate(() => this.executions.reportTargetExecution(organizationId, executionId, user.id ?? null, parsed.data));
  }
}

async function translate<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (error) {
    if (!(error instanceof RegistrationTargetException)) throw error;
    if (error.code === 'not_found') throw new NotFoundException(error.message);
    if (error.code === 'conflict') throw new ConflictException(error.message);
    throw new BadRequestException(error.message);
  }
}

import { UseFilters } from '@nestjs/common';
import { ChannelBusinessExceptionFilter } from './channel-business-exception.filter';
import { BadRequestException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { RegistrationTargetCreateInputSchema, RegistrationTargetResolveInputSchema, RegistrationTargetUpdateInputSchema } from '@kiditem/shared/sales-product';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { REGISTRATION_TARGET_PORT, type RegistrationTargetPort } from '../../../application/port/in/registration-target.port';
import { RegistrationTargetException } from '../../../application/exception/registration-target.exception';

@UseFilters(ChannelBusinessExceptionFilter)
@Controller('channels/registration-targets')
export class RegistrationTargetController {
  constructor(@Inject(REGISTRATION_TARGET_PORT) private readonly targets: RegistrationTargetPort) {}

  @Get()
  list(@CurrentOrganization() organizationId: string, @Query('salesProductId', new ParseUUIDPipe()) salesProductId: string) {
    return translate(() => this.targets.list(organizationId, salesProductId));
  }
  @Get(':id')
  get(@CurrentOrganization() organizationId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return translate(() => this.targets.get(organizationId, id));
  }
  @Post()
  create(@CurrentOrganization() organizationId: string, @Body() body: unknown) {
    const parsed = RegistrationTargetCreateInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return translate(() => this.targets.create(organizationId, parsed.data));
  }
  @Post('resolve')
  resolve(@CurrentOrganization() organizationId: string, @Body() body: unknown) {
    const parsed = RegistrationTargetResolveInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return translate(() => this.targets.resolve(organizationId, parsed.data));
  }
  @Put(':id')
  update(@CurrentOrganization() organizationId: string, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown) {
    const parsed = RegistrationTargetUpdateInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return translate(() => this.targets.update(organizationId, id, parsed.data));
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

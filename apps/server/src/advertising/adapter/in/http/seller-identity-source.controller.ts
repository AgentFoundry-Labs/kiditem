import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { z } from 'zod';
import {
  SellerIdentitySourceBeginSchema,
  SellerIdentitySourceCaptureSchema,
} from '@kiditem/shared/advertising';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { SellerIdentitySourceRepository } from '../../out/repository/seller-identity-source.repository';

@Controller('ads/competitor-seller-identities/attempts')
export class SellerIdentitySourceController {
  constructor(private readonly owner: SellerIdentitySourceRepository) {}
  @Post()
  begin(
    @CurrentOrganization() org: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() raw: unknown,
  ) {
    if (
      !SellerIdentitySourceBeginSchema.safeParse(raw).success ||
      !key?.trim() ||
      key.length > 128
    ) {
      throw new BadRequestException('INVALID_SELLER_IDENTITY_ATTEMPT');
    }
    return this.owner.begin(org, key.trim());
  }
  @Get('current')
  source(@CurrentOrganization() org: string) {
    return this.owner.source(org);
  }
  @Get(':attemptId')
  read(
    @CurrentOrganization() org: string,
    @Param('attemptId', new ParseUUIDPipe()) id: string,
  ) {
    return this.owner.read(org, id);
  }
  @Get(':attemptId/capture')
  capture(
    @CurrentOrganization() org: string,
    @Param('attemptId', new ParseUUIDPipe()) id: string,
  ) {
    return this.owner.capture(org, id);
  }
  @Put(':attemptId')
  complete(
    @CurrentOrganization() org: string,
    @Param('attemptId', new ParseUUIDPipe()) id: string,
    @Headers('x-source-attempt-token') token: string,
    @Body() raw: unknown,
  ) {
    const body = SellerIdentitySourceCaptureSchema.safeParse(raw);
    if (!body.success)
      throw new BadRequestException('INVALID_IDENTITY_CAPTURE');
    return this.owner.complete(org, id, attemptToken(token), body.data);
  }
  @Post(':attemptId/fail')
  fail(
    @CurrentOrganization() org: string,
    @Param('attemptId', new ParseUUIDPipe()) id: string,
    @Headers('x-source-attempt-token') token: string,
    @Body() raw: unknown,
  ) {
    const body = z
      .object({
        code: z.string().trim().min(1).max(100),
        message: z.string().trim().min(1).max(300),
      })
      .strict()
      .safeParse(raw);
    if (!body.success)
      throw new BadRequestException('INVALID_IDENTITY_FAILURE');
    return this.owner.fail(
      org,
      id,
      attemptToken(token),
      body.data.code,
      body.data.message,
    );
  }
}
function attemptToken(raw: string) {
  const parsed = z.string().uuid().safeParse(raw);
  if (!parsed.success)
    throw new BadRequestException('INVALID_SOURCE_ATTEMPT_TOKEN');
  return parsed.data;
}

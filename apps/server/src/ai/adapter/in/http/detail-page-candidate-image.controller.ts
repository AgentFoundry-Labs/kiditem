import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { DetailPageClientRenderService } from '../../../application/service/detail-page-client-render.service';
import {
  FailDetailPageClientRenderDto,
  FinalizeDetailPageClientRenderDto,
} from './dto';

/**
 * 수집상품의 저장된 revision을 브라우저 렌더 intent와 확정 이미지 artifact로 연결한다.
 * 서버는 revision/저장 key/검증 권한을 소유하지만 이 경로에서 Chromium을 실행하지 않는다.
 */
@Controller('ai/detail-page-image')
export class DetailPageCandidateImageController {
  constructor(private readonly service: DetailPageClientRenderService) {}

  @Post('candidate/:candidateId/client-render')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  prepare(
    @Param('candidateId', new ParseUUIDPipe()) candidateId: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.prepare({
      organizationId,
      userId: user.id,
      sourceCandidateId: candidateId,
    });
  }

  @Post('render-intents/:intentId/claim')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  claim(
    @Param('intentId', new ParseUUIDPipe()) intentId: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.claim({ organizationId, userId: user.id, intentId });
  }

  @Get('render-intents/:intentId/document')
  @Header('Cache-Control', 'no-store')
  document(
    @Param('intentId', new ParseUUIDPipe()) intentId: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.document({ organizationId, userId: user.id, intentId });
  }

  @Get('render-intents/:intentId')
  @Header('Cache-Control', 'no-store')
  status(
    @Param('intentId', new ParseUUIDPipe()) intentId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.status({ organizationId, intentId });
  }

  @Post('render-intents/:intentId/finalize')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  finalize(
    @Param('intentId', new ParseUUIDPipe()) intentId: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: FinalizeDetailPageClientRenderDto,
  ) {
    return this.service.finalize({
      organizationId,
      userId: user.id,
      intentId,
      body,
    });
  }

  @Post('render-intents/:intentId/fail')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  fail(
    @Param('intentId', new ParseUUIDPipe()) intentId: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: FailDetailPageClientRenderDto,
  ) {
    return this.service.fail({
      organizationId,
      userId: user.id,
      intentId,
      body,
    });
  }
}

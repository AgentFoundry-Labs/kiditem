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
 * 작업공간의 저장된 revision을 서버 Chromium으로 렌더하고 확정 이미지 artifact로 연결한다.
 * Wing 폼 확장은 완성된 이미지 URL만 소비하며 상세페이지 캡처에는 관여하지 않는다.
 */
@Controller('ai/detail-page-image')
export class DetailPageWorkspaceImageController {
  constructor(private readonly service: DetailPageClientRenderService) {}

  @Post('workspace/:contentWorkspaceId/server-render')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  prepare(
    @Param('contentWorkspaceId', new ParseUUIDPipe()) contentWorkspaceId: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.prepare({
      organizationId,
      userId: user.id,
      contentWorkspaceId,
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

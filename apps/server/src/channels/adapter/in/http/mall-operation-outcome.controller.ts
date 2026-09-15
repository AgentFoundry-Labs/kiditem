import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  RecordMallOperationOutcomeRequestSchema,
  type RecordMallOperationOutcomeRequest,
} from '@kiditem/shared/mall-operation-outcomes';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { MallOperationOutcomeService } from '../../../application/service/mall-operation-outcome.service';
import { MallOperationOutcomeSummaryQueryDto } from './dto/mall-operation-outcome.dto';

/**
 * 쇼핑몰 에이전트의 관찰 기록.
 *
 * 웹이 결과가 난 자리(로그인 확인 · 로그인 테스트 · 등록 폼 채움)에서 한 줄씩 쓰고, 쇼핑몰 홈이
 * 요약을 읽는다. 조직과 사람은 세션에서만 받는다 — 본문은 `.strict()` 공유 계약이라 모르는
 * 키(organizationId, password 등)는 거절한다.
 */
@Controller('channels/mall-operation-outcomes')
export class MallOperationOutcomeController {
  constructor(private readonly outcomes: MallOperationOutcomeService) {}

  @Post()
  record(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    return this.outcomes.record(organizationId, user.id, parseRecordBody(body));
  }

  @Get('summary')
  summary(
    @CurrentOrganization() organizationId: string,
    @Query() query: MallOperationOutcomeSummaryQueryDto,
  ) {
    return this.outcomes.summary(organizationId, query.days ?? 7);
  }
}

function parseRecordBody(body: unknown): RecordMallOperationOutcomeRequest {
  const parsed = RecordMallOperationOutcomeRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`),
    );
  }
  return parsed.data;
}

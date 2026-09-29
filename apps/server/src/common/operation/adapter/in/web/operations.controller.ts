import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import {
  OPERATION_TOKEN_HEADER,
  OperationBeginRequestSchema,
  OperationChunkKindSchema,
  OperationChunkPutRequestSchema,
  OperationChunkSequenceSchema,
  OperationClaimRequestSchema,
  OperationFinishRequestSchema,
  OperationListQuerySchema,
} from '@kiditem/shared/operation';
import { KiditemNotFoundError } from '@kiditem/shared/errors';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../../auth/auth.types';
import { OPERATION_PORT, type OperationPort } from '../../../application/port/in/operation.port';
import { parseOperationRequest } from './parse-operation-request';

/** 실행 계약의 HTTP 문(ADR-0025) — begin·chunk·finish·cancel·목록·하나 읽기. 토큰은 `x-operation-token` 헤더, 조직은 세션에서. */
@Controller('operations')
export class OperationsController {
  constructor(@Inject(OPERATION_PORT) private readonly operations: OperationPort) {}

  @Post()
  begin(@CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.operations.begin(organizationId, parseOperationRequest(OperationBeginRequestSchema, body, 'body'), { userId: user.id, origin: 'http' });
  }

  /**
   * 조직 범위 claim(KID-386): 확장이 서버가 준비해 둔 실행(`prepared`, 예: 승인된 광고 액션)을 받아 간다.
   * 후보가 없으면 `{ operation: null, token: null }`. 토큰은 이 응답에만 실린다.
   */
  @Post('claim')
  @HttpCode(200)
  async claim(@CurrentOrganization() organizationId: string, @Body() body: unknown) {
    const claimed = await this.operations.claimForOrganization(
      organizationId,
      parseOperationRequest(OperationClaimRequestSchema, body, 'body'),
    );
    return claimed ?? { operation: null, token: null };
  }
  @Put(':id/chunks/:chunkKind/:sequence')
  putChunk(
    @CurrentOrganization() organizationId: string,
    @Param('id', new ParseUUIDPipe()) operationId: string,
    @Param('chunkKind') chunkKind: string,
    @Param('sequence') sequence: string,
    @Headers(OPERATION_TOKEN_HEADER) token: string | undefined,
    @Body() body: unknown,
  ) {
    return this.operations.putChunk({
      organizationId,
      operationId,
      token,
      chunkKind: parseOperationRequest(OperationChunkKindSchema, chunkKind, 'chunkKind'),
      sequence: parseOperationRequest(OperationChunkSequenceSchema, sequence, 'sequence'),
      request: parseOperationRequest(OperationChunkPutRequestSchema, body, 'body'),
    });
  }

  @Post(':id/finish')
  @HttpCode(200)
  finish(
    @CurrentOrganization() organizationId: string,
    @Param('id', new ParseUUIDPipe()) operationId: string,
    @Headers(OPERATION_TOKEN_HEADER) token: string | undefined,
    @Body() body: unknown,
  ) {
    return this.operations.finish({
      organizationId,
      operationId,
      token,
      request: parseOperationRequest(OperationFinishRequestSchema, body, 'body'),
    });
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentOrganization() organizationId: string, @Param('id', new ParseUUIDPipe()) operationId: string) {
    return this.operations.cancel(organizationId, operationId);
  }

  /** 실행 하나(화면이 실행 ID를 쥐고 있을 때). 임대가 끝났으면 먼저 만료 처분한 보기다. */
  @Get(':id')
  async get(@CurrentOrganization() organizationId: string, @Param('id', new ParseUUIDPipe()) operationId: string) {
    const operation = await this.operations.get(organizationId, operationId);
    if (!operation) throw new KiditemNotFoundError('OPERATION_NOT_FOUND');
    return { operation };
  }

  @Get()
  list(@CurrentOrganization() organizationId: string, @Query() query: unknown) {
    return this.operations.list(organizationId, parseOperationRequest(OperationListQuerySchema, query, 'query'));
  }
}

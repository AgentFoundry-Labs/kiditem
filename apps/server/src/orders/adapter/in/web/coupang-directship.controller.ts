import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { CoupangDirectPoSnapshotResponse } from '@kiditem/shared/coupang-direct-order';
import { CoupangDirectshipConvertRequestSchema } from '@kiditem/shared/orders-operations';
import { CoupangDirectshipService } from '../../../coupang-directship/coupang-directship.service';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import {
  COUPANG_DIRECT_ORDER_COLLECTION_PORT,
  type CoupangDirectOrderCollectionPort,
} from '../../../application/port/in/coupang-direct-order-collection.port';

/**
 * 쿠팡 directship(로켓 최종주문) 캡처 읽기·달력 스냅샷·변환 라우트(KID-359, KID-370). 수집은 실행 kind
 * `orders.coupang_directship`(`/api/operations`)이고 attempt 라우트는 없다. 달력은 계정의 최근 성공한 실행 캡처를 읽기만
 * 하고(실행을 시작하지 않는다), 변환은 그 실행의 ID로만 받는다.
 */
@Controller('orders/collection')
export class CoupangDirectshipController {
  constructor(
    private readonly coupangDirectshipService: CoupangDirectshipService,
    @Inject(COUPANG_DIRECT_ORDER_COLLECTION_PORT)
    private readonly coupangDirectOrderCollection: CoupangDirectOrderCollectionPort,
  ) {}

  /** 성공한 directship 실행이 보관한 캡처(달력·변환 화면이 다시 읽는다). */
  @Get('coupang-directship/operations/:operationId/capture')
  readCoupangDirectCapture(
    @Param('operationId', new ParseUUIDPipe()) operationId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.coupangDirectOrderCollection.readCapture({ organizationId, operationId });
  }

  /** 입고예정일 달력: 그 계정의 가장 최근 성공한 directship 실행 캡처(`operationId` 포함). 없으면 빈 칸. */
  @Get('coupang-directship/snapshot')
  async readCoupangDirectSnapshot(
    @Query('channelAccountId') channelAccountId: string,
    @CurrentOrganization() organizationId: string,
  ): Promise<CoupangDirectPoSnapshotResponse> {
    const query = parseBody(SnapshotQuerySchema, { channelAccountId });
    return this.coupangDirectOrderCollection.readLatestSnapshot({ organizationId, channelAccountId: query.channelAccountId });
  }

  @Post('coupang-directship/convert')
  @Header('Access-Control-Expose-Headers', [
    'Content-Disposition',
    'X-Order-Collection-Source-Rows',
    'X-Order-Collection-Product-Rows',
    'X-Order-Collection-Output-Rows',
    'X-Order-Collection-Skipped-Rows',
    'X-Order-Collection-Operation-Id',
    'X-Rocket-Workbook-Export-Id',
    'X-Sellpia-Transmission-Intent-Key',
    'X-Rocket-Workbook-Matched-Rows',
    'X-Rocket-Workbook-Unmatched-Rows',
  ].join(', '))
  async convertCoupangDirectship(
    @Body() body: unknown,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile | void> {
    const convert = parseBody(CoupangDirectshipConvertRequestSchema, body);
    // 성공한 실행이 보관한 캡처에서 고른 한 운송유형을 소비한다. 변환 실패는 성공한 실행을 바꾸지 않는다.
    await this.coupangDirectOrderCollection.consume({
      organizationId,
      userId: user.id,
      operationId: convert.operationId,
      capture: { channelAccountId: convert.channelAccountId, pos: convert.pos, centers: convert.centers },
      transport: convert.transport,
    });
    const projection = await this.coupangDirectOrderCollection.readProjection({
      organizationId,
      operationId: convert.operationId,
      transport: convert.transport,
    });
    const collected = projection.receipt;
    response.setHeader('X-Order-Collection-Operation-Id', projection.operationId);
    if (collected.exportId) {
      response.setHeader('X-Rocket-Workbook-Export-Id', collected.exportId);
    }
    if (collected.transmissionIntentKey) {
      response.setHeader('X-Sellpia-Transmission-Intent-Key', collected.transmissionIntentKey);
    }
    response.setHeader('X-Order-Collection-Skipped-Rows', '0');
    response.setHeader('X-Rocket-Workbook-Matched-Rows', String(collected.matchedLines.length));
    response.setHeader('X-Rocket-Workbook-Unmatched-Rows', String(collected.unmatchedLines.length));
    if (collected.collectedLines.length === 0) {
      response.setHeader('X-Order-Collection-Source-Rows', '0');
      response.setHeader('X-Order-Collection-Product-Rows', '0');
      response.setHeader('X-Order-Collection-Output-Rows', '0');
      response.status(204);
      return;
    }

    const abortController = new AbortController();
    request.once('aborted', () => abortController.abort());
    const result = await this.coupangDirectshipService.generate(projection.request, {
      signal: abortController.signal,
    });
    response.setHeader('Content-Disposition', contentDispositionAttachment(result.fileName));
    response.setHeader('Content-Type', 'application/vnd.ms-excel');
    response.setHeader('X-Order-Collection-Source-Rows', String(result.poCount));
    response.setHeader('X-Order-Collection-Product-Rows', String(result.rowCount));
    response.setHeader('X-Order-Collection-Output-Rows', String(result.rowCount));
    return new StreamableFile(result.buffer);
  }
}

const SnapshotQuerySchema = z.object({ channelAccountId: z.string().uuid() }).strict();

function contentDispositionAttachment(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function parseBody<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new KiditemInvalidValueError('VALIDATION_FAILED', {
    details: { errors: parsed.error.issues.slice(0, 20).map((issue) => ({ field: issue.path.join('.'), reason: issue.message })) },
  });
}

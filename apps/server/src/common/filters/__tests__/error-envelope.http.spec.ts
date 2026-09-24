import 'reflect-metadata';
import { Body, Controller, Get, INestApplication, Logger, Module, Post, UseFilters } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsInt, IsString, Min } from 'class-validator';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ERROR_DEFINITIONS, ErrorResponseSchema } from '@kiditem/shared/errors';
import { GlobalExceptionFilter } from '../global-exception.filter';
import { createGlobalValidationPipe } from '../../validation/validation-pipe';
import { ChannelBusinessExceptionFilter } from '../../../channels/adapter/in/web/channel-business-exception.filter';
import { ChannelNotFoundError } from '../../../channels/domain/exception/channel-business-error';
import { SourceRecordDuplicateFilter } from '../../../sourcing/adapter/in/http/source-record-duplicate.filter';
import { SourceRecordDuplicateError } from '../../../sourcing/domain/source-record-admission';

class ProbeDto {
  @IsString() name!: string;
  @IsInt() @Min(1) quantity!: number;
}

const EXISTING = { sourceRecordId: 'r1', salesProductId: 'sp1', salesProductStatus: 'active' as const };

@Controller('probe')
class ErrorEnvelopeProbeController {
  @Post('items')
  create(@Body() body: ProbeDto) { return body; }

  @Get('duplicate')
  @UseFilters(SourceRecordDuplicateFilter)
  duplicate() {
    throw new SourceRecordDuplicateError({ kind: 'refuse', reason: 'selling_product_exists', existing: EXISTING });
  }

  @Get('channel')
  channel() { throw new ChannelNotFoundError('Wing listing 42 not found'); }
}
// vitest(esbuild)는 decorator metadata를 내지 않으므로 ValidationPipe가 볼 metatype을 직접 적는다.
Reflect.defineMetadata('design:paramtypes', [ProbeDto], ErrorEnvelopeProbeController.prototype, 'create');

@Module({ controllers: [ErrorEnvelopeProbeController] })
class ErrorEnvelopeProbeModule {}

describe('HTTP error envelope (main.ts pipe + filters)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({ imports: [ErrorEnvelopeProbeModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(createGlobalValidationPipe());
    app.useGlobalFilters(new GlobalExceptionFilter(), new ChannelBusinessExceptionFilter());
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  it('a DTO validation failure answers 400 VALIDATION_FAILED with Korean field reasons', async () => {
    const response = await request(app.getHttpServer()).post('/api/probe/items').send({ name: 7, quantity: 0 }).expect(400);
    expect(ErrorResponseSchema.parse(response.body)).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      kind: 'validation',
      message: ERROR_DEFINITIONS.VALIDATION_FAILED.text,
      errors: [
        { field: 'name', value: 7, reason: '문자열이어야 합니다.' },
        { field: 'quantity', value: 0, reason: '너무 작습니다.' },
      ],
    });
  });

  it('a duplicate source record keeps existing in details for the web link', async () => {
    const response = await request(app.getHttpServer()).get('/api/probe/duplicate').expect(409);
    expect(ErrorResponseSchema.parse(response.body)).toMatchObject({
      code: 'SOURCING_DUPLICATE_RECORD',
      details: { reason: 'selling_product_exists', existing: EXISTING },
    });
  });

  it('a channel domain error and a missing route both answer in Korean', async () => {
    const channel = await request(app.getHttpServer()).get('/api/probe/channel').expect(404);
    expect(channel.body).toEqual({ statusCode: 404, code: 'NOT_FOUND', kind: 'not_found', message: ERROR_DEFINITIONS.NOT_FOUND.text, errors: [] });
    const missing = await request(app.getHttpServer()).get('/api/no-such-route').expect(404);
    expect(missing.body).toMatchObject({ code: 'NOT_FOUND', message: ERROR_DEFINITIONS.NOT_FOUND.text });
  });
});

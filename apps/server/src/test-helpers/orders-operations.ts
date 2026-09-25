import { createHash } from 'node:crypto';
import type { INestApplication, Provider, Type } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { json } from 'express';
import request from 'supertest';
import { OPERATION_TOKEN_HEADER, OperationBeginResponseSchema, type OperationBeginResponse } from '@kiditem/shared/operation';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { OperationsController } from '../common/operation/adapter/in/web/operations.controller';
import { OperationRepositoryAdapter } from '../common/operation/adapter/out/repository/operation.repository.adapter';
import { OPERATION_PORT } from '../common/operation/application/port/in/operation.port';
import { OPERATION_REPOSITORY } from '../common/operation/application/port/out/repository/operation.repository.port';
import { OperationOwnerRegistry } from '../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../common/operation/application/service/operation.service';
import { PrismaService } from '../prisma/prisma.service';
import { TEST_ORGANIZATION_ID, TEST_USER_ID } from './real-prisma';

/**
 * Orders 실행 kind(KID-359 wave2)를 실제 실행 계약(HTTP 경로 그대로)과 실제 owner·PG로 돌리는 시험 앱.
 * `x-test-org` 헤더로 요청 조직을 바꾼다. 확장 runner가 하는 순서(begin → 청크 → finish)를 HTTP로 흉내 낸다.
 */
export async function ordersOperationsApp(
  prisma: PrismaClient,
  options: { owners: Type<unknown>[]; controllers?: Type<unknown>[]; providers?: Provider[] },
) {
  const module = await Test.createTestingModule({
    imports: [DiscoveryModule],
    controllers: [OperationsController, ...(options.controllers ?? [])],
    providers: [
      OperationOwnerRegistry,
      OperationService,
      { provide: OPERATION_PORT, useExisting: OperationService },
      { provide: OPERATION_REPOSITORY, useValue: new OperationRepositoryAdapter(prisma as never) },
      { provide: PrismaService, useValue: prisma },
      ...options.owners,
      ...(options.providers ?? []),
    ],
  }).compile();
  const app: INestApplication = module.createNestApplication({ logger: false, bodyParser: false });
  app.use(json({ limit: '25mb' }));
  app.setGlobalPrefix('api');
  app.use((req: { headers: Record<string, string>; authUser?: unknown }, _res: unknown, next: () => void) => {
    req.authUser = { id: TEST_USER_ID, organizationId: req.headers['x-test-org'] ?? TEST_ORGANIZATION_ID };
    next();
  });
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
  await app.listen(0, '127.0.0.1');
  const httpUrl = await app.getUrl();

  const checksum = (payload: unknown[]) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

  function begin(kind: string, scope: Record<string, unknown>, organizationId = TEST_ORGANIZATION_ID) {
    return request(httpUrl).post('/api/operations').set('x-test-org', organizationId).send({ kind, scope });
  }

  async function beginRun(kind: string, scope: Record<string, unknown>, organizationId = TEST_ORGANIZATION_ID): Promise<OperationBeginResponse> {
    return OperationBeginResponseSchema.parse((await begin(kind, scope, organizationId).expect(201)).body);
  }

  /** 청크 종류마다 1부터 순번을 매겨 올린다(runner와 같다). */
  async function put(run: OperationBeginResponse, chunks: Array<{ chunkKind: string; payload: unknown[] }>, organizationId = TEST_ORGANIZATION_ID) {
    const sequences = new Map<string, number>();
    for (const chunk of chunks) {
      const sequence = (sequences.get(chunk.chunkKind) ?? 0) + 1;
      sequences.set(chunk.chunkKind, sequence);
      await request(httpUrl)
        .put(`/api/operations/${run.operation.id}/chunks/${chunk.chunkKind}/${sequence}`)
        .set('x-test-org', organizationId)
        .set(OPERATION_TOKEN_HEADER, run.token)
        .send({ checksum: checksum(chunk.payload), payload: chunk.payload })
        .expect(200);
    }
  }

  function finish(run: OperationBeginResponse, body: Record<string, unknown> = { outcome: 'succeeded' }, organizationId = TEST_ORGANIZATION_ID) {
    return request(httpUrl)
      .post(`/api/operations/${run.operation.id}/finish`)
      .set('x-test-org', organizationId)
      .set(OPERATION_TOKEN_HEADER, run.token)
      .send(body);
  }

  return { app, httpUrl, begin, beginRun, put, finish };
}

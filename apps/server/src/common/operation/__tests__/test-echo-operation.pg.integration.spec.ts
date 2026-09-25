import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OPERATION_TOKEN_HEADER, OperationBeginResponseSchema, OperationListResponseSchema } from '@kiditem/shared/operation';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../../test-helpers/real-prisma';
import { GlobalExceptionFilter } from '../../filters/global-exception.filter';
import { TestEchoOperationOwner } from '../adapter/in/operation/test-echo-operation-owner';
import { OperationsController } from '../adapter/in/web/operations.controller';
import { OperationRepositoryAdapter } from '../adapter/out/repository/operation.repository.adapter';
import { OPERATION_PORT } from '../application/port/in/operation.port';
import { OPERATION_REPOSITORY } from '../application/port/out/repository/operation.repository.port';
import { OperationOwnerRegistry } from '../application/service/operation-owner.registry';
import { OperationService } from '../application/service/operation.service';

// 확장 새 런타임(KID-357)이 test.echo로 도는 길을 서버 쪽에서 그대로 밟는다:
// begin(org) → echo 청크 2장(각 3항목) → finish(succeeded, 확장 summarize의 result) → reader.
const checksum = (payload: unknown[]) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

describe('test.echo owner over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [OperationsController],
      providers: [
        OperationOwnerRegistry,
        OperationService,
        { provide: OPERATION_PORT, useExisting: OperationService },
        { provide: OPERATION_REPOSITORY, useValue: new OperationRepositoryAdapter(prisma as never) },
        TestEchoOperationOwner,
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use((req: { authUser?: unknown }, _res: unknown, next: () => void) => {
      req.authUser = { id: USER, organizationId: ORG };
      next();
    });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    await app.listen(0, '127.0.0.1');
    httpUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('begin(org) → echo 청크 2장 → finish가 result {chunks: 2, items: 6}로 끝나고 reader가 succeeded를 본다', async () => {
    const begun = OperationBeginResponseSchema.parse(
      (await request(httpUrl).post('/api/operations').send({ kind: 'test.echo', scope: {} }).expect(201)).body,
    );
    expect(begun.operation).toMatchObject({ kind: 'test.echo', status: 'executing', lockKeys: ['org'], plan: { echo: true, lockKeys: ['org'] } });

    for (const sequence of [1, 2]) {
      const payload = [1, 2, 3].map((n) => ({ i: (sequence - 1) * 3 + n, at: '2026-09-25T00:00:00.000Z' }));
      await request(httpUrl)
        .put(`/api/operations/${begun.operation.id}/chunks/echo/${sequence}`)
        .set(OPERATION_TOKEN_HEADER, begun.token)
        .send({ checksum: checksum(payload), payload, progress: { done: sequence } })
        .expect(200);
    }

    const finished = await request(httpUrl)
      .post(`/api/operations/${begun.operation.id}/finish`)
      .set(OPERATION_TOKEN_HEADER, begun.token)
      .send({ outcome: 'succeeded', result: { echo: true } })
      .expect(200);
    expect(finished.body.operation).toMatchObject({ status: 'succeeded', result: { chunks: 2, items: 6 }, lockKeys: [] });

    const listed = OperationListResponseSchema.parse(
      (await request(httpUrl).get('/api/operations?kinds=test.echo').expect(200)).body,
    ).operations;
    expect(listed).toEqual([
      expect.objectContaining({ id: begun.operation.id, status: 'succeeded', result: { chunks: 2, items: 6 }, progress: { done: 2 } }),
    ]);
  });

  it('org를 잡은 test.echo가 도는 동안 두 번째 begin은 OPERATION_IN_PROGRESS — details가 돌고 있는 실행을 이름한다', async () => {
    const first = OperationBeginResponseSchema.parse(
      (await request(httpUrl).post('/api/operations').send({ kind: 'test.echo', scope: {} }).expect(201)).body,
    );

    const second = await request(httpUrl).post('/api/operations').send({ kind: 'test.echo', scope: {} }).expect(409);

    expect(second.body).toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: first.operation.id, kind: 'test.echo', lockKeys: ['org'] } });
  });
});

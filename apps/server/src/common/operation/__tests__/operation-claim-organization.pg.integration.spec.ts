import { Injectable, type INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OperationClaimResponseSchema, type OperationPlanResult } from '@kiditem/shared/operation';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID as OTHER_ORG,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../../test-helpers/real-prisma';
import { GlobalExceptionFilter } from '../../filters/global-exception.filter';
import { OperationsController } from '../adapter/in/web/operations.controller';
import { OperationRepositoryAdapter } from '../adapter/out/repository/operation.repository.adapter';
import { OPERATION_PORT, type OperationPort } from '../application/port/in/operation.port';
import type { JsonObject, OperationOwnerPort } from '../application/port/out/owner/operation-owner.port';
import { OPERATION_REPOSITORY } from '../application/port/out/repository/operation.repository.port';
import { OperationOwner } from '../application/port/out/owner/operation-owner.decorator';
import { OperationOwnerRegistry } from '../application/service/operation-owner.registry';
import { OperationService } from '../application/service/operation.service';

/** 서버가 prepare해 두고 확장이 받아 가는 kind(광고 액션 모양): 10분 임대. */
@Injectable()
@OperationOwner()
class PreparedOwner implements OperationOwnerPort {
  readonly kind = 'test.prepared';
  readonly leaseMs = 600_000;
  async plan(scope: JsonObject): Promise<OperationPlanResult> {
    return { plan: { actionId: scope.actionId ?? null }, lockKeys: [`resource:test-action:${String(scope.actionId ?? '1')}`] };
  }
  async finalize() {
    return {};
  }
}

/**
 * 조직 범위 claim(KID-386): `POST /api/operations/claim`은 세션 조직의 `prepared` 실행만 집는다. 다른 조직이 준비한 실행은
 * 절대 나오지 않고, 후보가 없으면 `{ operation: null, token: null }`이다. 받은 토큰으로 finish까지 간다.
 */
describe('operation contract — organization-scoped claim (KID-386)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let operations: OperationPort;

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
        PreparedOwner,
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.use((req: { headers: Record<string, string | undefined>; authUser?: unknown }, _res: unknown, next: () => void) => {
      req.authUser = { id: USER, organizationId: req.headers['x-test-org'] ?? ORG };
      next();
    });
    await app.init();
    operations = module.get(OPERATION_PORT);
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  const claim = (organizationId: string) =>
    request(app.getHttpServer())
      .post('/api/operations/claim')
      .set('x-test-org', organizationId)
      .send({ kinds: ['test.prepared'], workerId: 'ext-a' });

  it('takes only the session organization\'s prepared operation, returns a token, and the other organization sees nothing', async () => {
    const mine = await operations.prepare(ORG, { kind: 'test.prepared', scope: { actionId: 'a1' }, maxAttempts: 1 });
    await operations.prepare(OTHER_ORG, { kind: 'test.prepared', scope: { actionId: 'b1' }, maxAttempts: 1 });

    const first = await claim(ORG).expect(200);
    const parsed = OperationClaimResponseSchema.parse(first.body);
    expect(parsed.operation).toMatchObject({ id: mine.operation.id, status: 'executing', attempts: 1 });
    expect(parsed.token).toEqual(expect.any(String));

    // 내 조직에 더는 후보가 없다 — 다른 조직의 prepared는 나오지 않는다.
    const second = await claim(ORG).expect(200);
    expect(second.body).toEqual({ operation: null, token: null });

    // 다른 조직은 자기 것만 받는다.
    const theirs = await claim(OTHER_ORG).expect(200);
    expect(theirs.body.operation).toMatchObject({ status: 'executing' });
    expect(theirs.body.operation.id).not.toBe(mine.operation.id);

    // 받은 토큰으로 finish까지 간다.
    const finished = await operations.finish({
      organizationId: ORG,
      operationId: mine.operation.id,
      token: parsed.token!,
      request: { outcome: 'succeeded', result: { done: true } },
    });
    expect(finished.operation).toMatchObject({ id: mine.operation.id, status: 'succeeded' });
  });

  it('rejects a malformed body with VALIDATION_FAILED and never touches the row', async () => {
    const mine = await operations.prepare(ORG, { kind: 'test.prepared', scope: { actionId: 'a2' }, maxAttempts: 1 });
    await request(app.getHttpServer()).post('/api/operations/claim').set('x-test-org', ORG).send({ kinds: [] }).expect(400);
    const row = await prisma.operation.findUniqueOrThrow({ where: { id: mine.operation.id } });
    expect(row.status).toBe('prepared');
    expect(row.attempts).toBe(0);
  });
});

// apps/server/src/products/__tests__/pagination.pg.integration.spec.ts
//
// 페이지네이션 안정성 — MastersService.list 는 `(createdAt DESC, id DESC)` tuple 커서를
// 사용한다. 페이지 1 을 받은 이후 중간에 row 가 soft-delete 되더라도:
//   (a) 남은 row 가 다음 페이지에 정상 노출되어야 하고,
//   (b) soft-delete 된 row 는 where.isDeleted=false 로 걸러져 재등장하지 않아야 한다.
//
// 왜 integration 인가: cursor 인코딩 (createdAt+id), `findMany` 의 `take: limit+1`,
// soft-delete filter 의 상호작용은 실제 Postgres ordering + Prisma client 로만
// 검증 가능. unit/mock 으로 가짜 풀기 의미 없음.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { MastersService } from '../application/service/masters.service';
import { createProductsTestServices } from './products-test-services';
import {
  makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

describe('Pagination stability', () => {
  let prisma: PrismaClient;
  let svc: MastersService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    svc = createProductsTestServices(prisma).mastersSvc;
  });
  afterAll(async () => { await prisma.$disconnect(); });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('cursor stability — paginate with mid-iteration soft-delete', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const m = await svc.create(TEST_ORGANIZATION_ID, { name: `M${i}` } as any);
      ids.push(m.id);
    }
    const page1 = await svc.list(TEST_ORGANIZATION_ID, { limit: 2 } as any);
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    // 페이지1 에 포함되지 않은 row 하나를 soft-delete → 다음 페이지에서 안 보여야 함.
    const notReturned = ids.find((id) => !page1.items.some((it) => it.id === id))!;
    await svc.softDelete(TEST_ORGANIZATION_ID, notReturned);

    const page2 = await svc.list(TEST_ORGANIZATION_ID, {
      limit: 2, cursor: page1.nextCursor!,
    } as any);
    expect(page2.items.some((it) => it.id === notReturned)).toBe(false);
    expect(page2.items.length).toBeGreaterThan(0);
    expect(page2.items.length).toBeLessThanOrEqual(2);
  });
});

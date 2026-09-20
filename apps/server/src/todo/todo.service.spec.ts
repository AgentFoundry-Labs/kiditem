import { describe, expect, it } from 'vitest';
import { TodoService } from './todo.service';
import type { PrismaService } from '../prisma/prisma.service';

const ORG = '11111111-1111-1111-1111-111111111111';

interface Row {
  id: string;
  organizationId: string;
  owner: string;
  area: string;
  title: string;
  detail: string | null;
  status: string;
  sortOrder: number;
  doneAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function setup(initial: Partial<Row>[] = []) {
  const rows: Row[] = initial.map((row, index) => ({
    id: `todo-${index}`,
    organizationId: ORG,
    owner: 'kiditem',
    area: '몰 대량등록',
    title: `할 일 ${index}`,
    detail: null,
    status: 'open',
    sortOrder: index,
    doneAt: null,
    createdAt: new Date('2026-09-20T00:00:00Z'),
    updatedAt: new Date('2026-09-20T00:00:00Z'),
    ...row,
  }));
  const prisma = {
    todoItem: {
      findMany: async ({ where, select }: { where: { organizationId: string }; select?: Record<string, boolean> }) => {
        const found = rows.filter((row) => row.organizationId === where.organizationId);
        return select ? found.map((row) => ({ area: row.area, title: row.title })) : found;
      },
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        rows.find((row) => row.id === where.id && row.organizationId === where.organizationId) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((item) => item.id === where.id)!;
        for (const [key, value] of Object.entries(data)) if (value !== undefined) Object.assign(row, { [key]: value });
        return row;
      },
      createMany: async ({ data }: { data: Omit<Row, 'id' | 'createdAt' | 'updatedAt'>[] }) => {
        for (const item of data) {
          rows.push({ ...item, id: `todo-${rows.length}`, createdAt: new Date(), updatedAt: new Date() } as Row);
        }
        return { count: data.length };
      },
    },
  } as unknown as PrismaService;
  return { rows, service: new TodoService(prisma) };
}

describe('TodoService', () => {
  it('counts what is left by status', async () => {
    const { service } = setup([{ status: 'open' }, { status: 'doing' }, { status: 'done' }]);
    const list = await service.list(ORG);
    expect(list.counts).toEqual({ open: 1, doing: 1, done: 1 });
    expect(list.items).toHaveLength(3);
  });

  it('stamps the day a todo is finished and clears it when reopened', async () => {
    const { rows, service } = setup([{ status: 'open' }]);
    await service.update(ORG, 'todo-0', { status: 'done' });
    expect(rows[0]!.doneAt).toBeInstanceOf(Date);
    await service.update(ORG, 'todo-0', { status: 'open' });
    expect(rows[0]!.doneAt).toBeNull();
  });

  it('adds only the seeded lines that are not there yet', async () => {
    const { rows, service } = setup([{ area: '몰 대량등록', title: '떠리몰 담당자 알려주기' }]);
    const result = await service.seed(ORG, {
      items: [
        { owner: 'operator', area: '몰 대량등록', title: '떠리몰 담당자 알려주기' },
        { owner: 'operator', area: '몰 대량등록', title: '도매꾹 반품배송지 번호 알려주기' },
      ],
    });
    expect(result).toEqual({ added: 1, skipped: 1 });
    expect(rows).toHaveLength(2);
  });

  it('refuses a line without a title', async () => {
    const { service } = setup();
    await expect(service.create(ORG, { owner: 'operator', area: '몰 대량등록', title: '  ' }))
      .rejects.toThrow('할 일 내용이 올바르지 않습니다.');
  });
});

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  TodoCreateInputSchema,
  TodoSeedRequestSchema,
  TodoUpdateInputSchema,
  type TodoItem,
  type TodoList,
  type TodoOwner,
  type TodoStatus,
} from '@kiditem/shared/todo';
import type { TodoItem as TodoRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 할 일 목록(TO DO LIST 화면) — 사장님이 해 줘야 하는 일과 우리가 만들 일을 한 곳에 적는다.
 *
 * 순서는 `sortOrder` 다음 만든 때다. 끝낸 줄은 지우지 않고 `done` 으로 남겨, 무엇을 언제 끝냈는지 볼 수 있게 한다.
 */
@Injectable()
export class TodoService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string): Promise<TodoList> {
    const rows = await this.prisma.todoItem.findMany({
      where: { organizationId },
      orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const items = rows.map(toItem);
    return {
      items,
      counts: {
        open: items.filter((item) => item.status === 'open').length,
        doing: items.filter((item) => item.status === 'doing').length,
        done: items.filter((item) => item.status === 'done').length,
      },
    };
  }

  async create(organizationId: string, body: unknown): Promise<TodoItem> {
    const parsed = TodoCreateInputSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('할 일 내용이 올바르지 않습니다.');
    const input = parsed.data;
    const row = await this.prisma.todoItem.create({
      data: {
        organizationId,
        owner: input.owner,
        area: input.area,
        title: input.title,
        detail: input.detail ?? null,
        status: input.status,
        sortOrder: input.sortOrder,
        doneAt: input.status === 'done' ? new Date() : null,
      },
    });
    return toItem(row);
  }

  async update(organizationId: string, id: string, body: unknown): Promise<TodoItem> {
    const parsed = TodoUpdateInputSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('할 일 내용이 올바르지 않습니다.');
    const patch = parsed.data;
    const found = await this.prisma.todoItem.findFirst({ where: { id, organizationId }, select: { id: true, status: true } });
    if (!found) throw new NotFoundException('할 일을 찾지 못했습니다.');
    const row = await this.prisma.todoItem.update({
      where: { id: found.id },
      data: {
        ...patch,
        detail: patch.detail === undefined ? undefined : patch.detail ?? null,
        // 끝낸 때는 `done` 으로 바뀐 그 순간이다. 다시 열면 지운다.
        doneAt: patch.status === undefined || patch.status === found.status
          ? undefined
          : patch.status === 'done' ? new Date() : null,
      },
    });
    return toItem(row);
  }

  async remove(organizationId: string, id: string): Promise<{ removed: boolean }> {
    const found = await this.prisma.todoItem.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!found) throw new NotFoundException('할 일을 찾지 못했습니다.');
    await this.prisma.todoItem.delete({ where: { id: found.id } });
    return { removed: true };
  }

  /** 여러 줄을 한 번에 넣는다. 같은 묶음 · 같은 제목이 이미 있으면 건너뛴다(다시 불러도 늘지 않게). */
  async seed(organizationId: string, body: unknown): Promise<{ added: number; skipped: number }> {
    const parsed = TodoSeedRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('할 일 목록이 올바르지 않습니다.');
    const existing = await this.prisma.todoItem.findMany({
      where: { organizationId },
      select: { area: true, title: true },
    });
    const seen = new Set(existing.map((item) => `${item.area}|${item.title}`));
    const fresh = parsed.data.items.filter((item) => !seen.has(`${item.area}|${item.title}`));
    if (fresh.length > 0) {
      await this.prisma.todoItem.createMany({
        data: fresh.map((item) => ({
          organizationId,
          owner: item.owner,
          area: item.area,
          title: item.title,
          detail: item.detail ?? null,
          status: item.status,
          sortOrder: item.sortOrder,
          doneAt: item.status === 'done' ? new Date() : null,
        })),
      });
    }
    return { added: fresh.length, skipped: parsed.data.items.length - fresh.length };
  }
}

function toItem(row: TodoRow): TodoItem {
  return {
    id: row.id,
    owner: row.owner as TodoOwner,
    area: row.area,
    title: row.title,
    detail: row.detail,
    status: row.status as TodoStatus,
    sortOrder: row.sortOrder,
    doneAt: row.doneAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

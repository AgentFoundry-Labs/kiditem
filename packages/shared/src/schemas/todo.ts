import { z } from 'zod';

/**
 * 할 일 한 줄(TO DO LIST 화면). 사장님이 해 줘야 하는 일(`operator`)과 우리가 만들 일(`kiditem`)을 한 곳에 적는다.
 * 몰 대량등록처럼 여러 화면 · 여러 몰에 걸친 일의 남은 조각을 잊지 않는 것이 목적이다.
 */
export const TODO_OWNERS = ['operator', 'kiditem'] as const;
export const TodoOwnerSchema = z.enum(TODO_OWNERS);
export type TodoOwner = z.infer<typeof TodoOwnerSchema>;

export const TODO_STATUSES = ['open', 'doing', 'done'] as const;
export const TodoStatusSchema = z.enum(TODO_STATUSES);
export type TodoStatus = z.infer<typeof TodoStatusSchema>;

export const TodoItemSchema = z.object({
  id: z.string().uuid(),
  owner: TodoOwnerSchema,
  /** 어느 일에 딸린 것인가(`몰 대량등록` 처럼). 화면이 이 이름으로 묶는다. */
  area: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  status: TodoStatusSchema,
  sortOrder: z.number().int(),
  doneAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type TodoItem = z.infer<typeof TodoItemSchema>;

export const TodoListSchema = z.object({
  items: z.array(TodoItemSchema),
  /** 상태별 수 — 화면 머리의 숫자. */
  counts: z.object({ open: z.number().int(), doing: z.number().int(), done: z.number().int() }),
});
export type TodoList = z.infer<typeof TodoListSchema>;

const title = z.string().trim().min(1).max(200);
const area = z.string().trim().min(1).max(60);

export const TodoCreateInputSchema = z.object({
  owner: TodoOwnerSchema,
  area,
  title,
  detail: z.string().trim().max(2000).nullable().optional(),
  status: TodoStatusSchema.default('open'),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
}).strict();
export type TodoCreateInput = z.input<typeof TodoCreateInputSchema>;

export const TodoUpdateInputSchema = z.object({
  owner: TodoOwnerSchema.optional(),
  area: area.optional(),
  title: title.optional(),
  detail: z.string().trim().max(2000).nullable().optional(),
  status: TodoStatusSchema.optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
}).strict();
export type TodoUpdateInput = z.input<typeof TodoUpdateInputSchema>;

/** 여러 줄을 한 번에 넣는다(같은 일이면 한 번에 적는다). 이미 같은 제목 · 같은 묶음이 있으면 넣지 않는다. */
export const TodoSeedRequestSchema = z.object({
  items: z.array(TodoCreateInputSchema).min(1).max(200),
}).strict();
export type TodoSeedRequest = z.input<typeof TodoSeedRequestSchema>;

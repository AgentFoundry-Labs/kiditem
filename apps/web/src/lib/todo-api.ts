import {
  TodoItemSchema,
  TodoListSchema,
  type TodoCreateInput,
  type TodoItem,
  type TodoList,
  type TodoUpdateInput,
} from '@kiditem/shared/todo';
import { apiClient } from '@/lib/api-client';

const BASE = '/api/todo';

/** 할 일 목록(TO DO LIST) 조회 키. */
export const todoKeys = {
  all: ['todo'] as const,
  list: () => ['todo', 'list'] as const,
};

export const todoApi = {
  list: (): Promise<TodoList> => apiClient.getParsed(BASE, TodoListSchema),
  create: async (body: TodoCreateInput): Promise<TodoItem> =>
    TodoItemSchema.parse(await apiClient.post<unknown>(BASE, body)),
  update: async (id: string, body: TodoUpdateInput): Promise<TodoItem> =>
    TodoItemSchema.parse(await apiClient.patch<unknown>(`${BASE}/${id}`, body)),
  remove: (id: string): Promise<{ removed: boolean }> => apiClient.delete<{ removed: boolean }>(`${BASE}/${id}`),
};

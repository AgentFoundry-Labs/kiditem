import { z } from 'zod';

// 백엔드 pagination.ts의 PaginatedResponse<T> 매핑
// 제네릭 팩토리 함수로 구현
export function PaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
  });
}

// NestJS 기본 HttpException 응답 형태
// 82개 throw에서 사용되는 표준 에러 응답
export const ApiErrorResponseSchema = z.object({
  statusCode: z.number(),
  message: z.union([z.string(), z.array(z.string())]),
  error: z.string().optional(),
});

// 3곳 중복 정의된 SyncInfo 통합
// products/page.tsx:51, inventory/page.tsx:40, profit-loss/page.tsx:28
export const SyncInfoSchema = z.object({
  lastSyncedAt: z.string().nullable(),
});

// 타입 export
export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type SyncInfo = z.infer<typeof SyncInfoSchema>;

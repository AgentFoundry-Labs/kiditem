import { z } from 'zod';

/**
 * Date | ISO string 둘 다 허용하는 Zod 헬퍼.
 *
 * 배경:
 * - Prisma는 DateTime 필드를 JS Date 객체로 반환
 * - JSON 직렬화 시 자동으로 ISO string으로 변환
 * - satisfies 패턴에서 서비스는 Date 그대로, API 응답은 string이므로
 *   스키마는 양쪽 모두 허용해야 타입 드리프트 감지가 가능
 */
export const zIsoDate = z.union([z.string(), z.date()]);

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

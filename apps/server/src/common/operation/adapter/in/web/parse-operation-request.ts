import { BadRequestException } from '@nestjs/common';
import type { FieldError } from '@kiditem/shared/errors';
import type { z } from 'zod';

/** shared Zod로 요청을 가른다. 실패는 `VALIDATION_FAILED` + 필드별 한국어 이유(ADR-0023). */
export function parseOperationRequest<T extends z.ZodTypeAny>(schema: T, raw: unknown, root: string): z.output<T> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const errors: FieldError[] = parsed.error.issues.map((issue) => ({
    field: [root, ...issue.path.map(String)].join('.'),
    reason: '올바르지 않습니다.',
  }));
  throw new BadRequestException({ code: 'VALIDATION_FAILED', errors });
}

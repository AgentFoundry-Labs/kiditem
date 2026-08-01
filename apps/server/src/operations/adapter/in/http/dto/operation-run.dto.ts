import { BadRequestException } from '@nestjs/common';
import {
  CreateOperationRunRequestSchema,
  type CreateOperationRunRequest,
} from '@kiditem/shared/operations';

export type CreateOperationRunDto = CreateOperationRunRequest;

export function parseCreateOperationRunDto(value: unknown): CreateOperationRunDto {
  const parsed = CreateOperationRunRequestSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException('invalid_operation_run_request');
  }
  return parsed.data;
}

export function parseIdempotencyKey(value: string | undefined): string | null {
  if (value === undefined || value.trim() === '') return null;
  const key = value.trim();
  if (key.length > 200) {
    throw new BadRequestException('invalid_idempotency_key');
  }
  return key;
}

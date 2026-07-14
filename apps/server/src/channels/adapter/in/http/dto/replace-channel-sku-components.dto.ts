import { BadRequestException } from '@nestjs/common';
import {
  RefreshChannelSkuMappingStatusInputSchema,
  ReplaceChannelSkuComponentsInputSchema,
  type RefreshChannelSkuMappingStatusInput,
  type ReplaceChannelSkuComponentsInput,
} from '@kiditem/shared/channel-sku-matching';

export function parseReplaceChannelSkuComponentsDto(
  value: unknown,
): ReplaceChannelSkuComponentsInput {
  const parsed = ReplaceChannelSkuComponentsInputSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Invalid ChannelSku component replacement',
      errors: parsed.error.flatten(),
    });
  }
  return parsed.data;
}

export function parseRefreshChannelSkuMappingStatusDto(
  value: unknown,
): RefreshChannelSkuMappingStatusInput {
  const parsed = RefreshChannelSkuMappingStatusInputSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Invalid ChannelSku mapping status refresh',
      errors: parsed.error.flatten(),
    });
  }
  return parsed.data;
}

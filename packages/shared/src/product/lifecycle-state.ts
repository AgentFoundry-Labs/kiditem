import { z } from 'zod';

export const PRODUCT_LIFECYCLE_STATES = ['active', 'paused', 'discontinued'] as const;

export const ProductLifecycleStateSchema = z.enum(PRODUCT_LIFECYCLE_STATES);

export type ProductLifecycleState = z.infer<typeof ProductLifecycleStateSchema>;

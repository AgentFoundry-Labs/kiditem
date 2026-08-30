import { z } from 'zod';
import type { OperationDefinition } from '../../../common/operation-definition';

const Id = z.string().uuid();

export const ProductsListingGenerationOperationInputSchema = z.object({
  candidateId: Id,
  productName: z.string().max(500),
  imageUrls: z.array(z.string().url()).max(40),
  category: z.string().max(200).nullable(),
  description: z.string().max(20_000).nullable(),
  target: z.string().max(1_000).nullable(),
  thumbnailUrl: z.string().url().nullable(),
  optionNames: z.array(z.string().min(1).max(500)).max(100),
  templateId: z.enum(['kids-playful', 'bold-vertical']),
  ageGroup: z.enum(['age-8-plus', 'age-14-plus']),
  detailImageCount: z.enum(['auto', '1', '2', '3', '4', '5', '6']),
  usageSectionMode: z.enum(['include', 'exclude']),
  kcCertificationStatus: z.enum(['unknown', 'none', 'exists']),
  kcCertificationNumber: z.string().max(200).nullable(),
  productSize: z.string().max(500).nullable(),
  colorVariantStatus: z.string().max(80).nullable(),
  colorVariantNames: z.string().max(2_000).nullable(),
  boxSetStatus: z.string().max(80).nullable(),
  boxSetQuantity: z.string().max(200).nullable(),
  task: z.enum(['all', 'detail', 'thumbnail']),
  idempotencyKey: z.string().min(1).max(256),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const PRODUCTS_LISTING_GENERATION_OPERATIONS = [
  {
    key: 'products.generate_listing_package',
    version: 1,
    title: '상품 등록 생성 패키지 준비',
    ownerDomain: 'products',
    engineType: 'domain',
    allowedTriggers: ['agent'],
    scheduleSupported: false,
    maxAttempts: 3,
    resourceClass: 'default',
    executionTimeoutMs: 900_000,
    inputSchema: ProductsListingGenerationOperationInputSchema,
  },
] as const satisfies readonly OperationDefinition[];

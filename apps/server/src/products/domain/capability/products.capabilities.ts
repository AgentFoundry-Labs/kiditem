import { z } from 'zod';
import type { CapabilityDefinition } from '../../../common/capability-definition';

const Uuid = z.string().uuid();

export const PRODUCTS_CAPABILITIES = [
  {
    key: 'products.create_listing_generation_package', ownerDomain: 'products', ownerInputPort: 'products.createListingGenerationPackage',
    description:
      'Start listing-content generation (detail page and/or thumbnail, per task) for an existing selling-product ' +
      'draft; optional fields override the brief the draft already holds (name, category, target, options, age ' +
      'group, KC status, size, colours, box set, template). The result is the detail page id, the thumbnail ' +
      'generation id, the content workspace id and the editor href (each id is null when that part was not ' +
      'requested). It enqueues work and returns immediately; it does not register the ' +
      'product on any mall and a draft that does not exist is refused.',
    resultSummary: '상품 등록용 생성 작업을 시작했습니다.',
    inputSchema: z.object({
      salesProductId: Uuid,
      productName: z.string().trim().max(500).nullable().optional(), imageUrls: z.array(z.string().url()).max(40).optional(),
      category: z.string().trim().max(200).nullable().optional(), description: z.string().trim().max(20_000).nullable().optional(),
      target: z.string().trim().max(1_000).nullable().optional(), thumbnailUrl: z.string().url().nullable().optional(),
      optionNames: z.array(z.string().trim().min(1).max(500)).max(100).optional(), templateId: z.enum(['kids-playful', 'bold-vertical']).optional(),
      ageGroup: z.enum(['age-8-plus', 'age-14-plus']).optional(), detailImageCount: z.enum(['auto', '1', '2', '3', '4', '5', '6']).optional(),
      usageSectionMode: z.enum(['include', 'exclude']).optional(), kcCertificationStatus: z.enum(['unknown', 'none', 'exists']).optional(),
      kcCertificationNumber: z.string().trim().max(200).nullable().optional(), productSize: z.string().trim().max(500).nullable().optional(),
      colorVariantStatus: z.string().trim().max(80).nullable().optional(), colorVariantNames: z.string().trim().max(2_000).nullable().optional(),
      boxSetStatus: z.string().trim().max(80).nullable().optional(), boxSetQuantity: z.string().trim().max(200).nullable().optional(),
      task: z.enum(['all', 'detail', 'thumbnail']).optional(),
    }).strict(),
    outputSchema: z.object({
      salesProductId: Uuid,
      detailPageId: Uuid.nullable(),
      thumbnailGenerationId: Uuid.nullable(),
      contentWorkspaceId: Uuid.nullable(),
      href: z.string().min(1),
    }).strict(),
    effects: ['db_write', 'job_enqueue'], approvalRisk: 'medium', idempotency: 'required',
  },
] as const satisfies readonly CapabilityDefinition[];

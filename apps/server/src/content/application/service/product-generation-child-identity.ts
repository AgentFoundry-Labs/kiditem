import { createHash } from 'node:crypto';

export type ProductGenerationChildKind = 'detail_page' | 'thumbnail';

export interface ProductGenerationChildIdentity {
  generationId: string;
  requestHash: string;
}

export function deriveProductGenerationChildIdentity(input: {
  organizationId: string;
  idempotencyKey: string;
  requestHash: string;
  kind: ProductGenerationChildKind;
}): ProductGenerationChildIdentity {
  const bytes = createHash('sha256')
    .update(`product-generation:${input.organizationId}:${input.idempotencyKey}:${input.kind}`)
    .digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');

  return {
    generationId: [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join('-'),
    requestHash: input.requestHash,
  };
}

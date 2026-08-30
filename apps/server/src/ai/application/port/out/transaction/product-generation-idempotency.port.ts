export const PRODUCT_GENERATION_IDEMPOTENCY_PORT = Symbol(
  'PRODUCT_GENERATION_IDEMPOTENCY_PORT',
);

export interface ProductGenerationIdempotencyPort {
  runExclusive<T>(
    input: { organizationId: string; idempotencyKey: string },
    work: () => Promise<T>,
  ): Promise<T>;
}

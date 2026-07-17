import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  CreateMasterProductInputSchema,
  CreateProductVariantInputSchema,
  MasterProductOperationsListQuerySchema,
  UpdateMasterProductInputSchema,
  UpdateProductVariantInputSchema,
  ReplaceProductVariantRecipeInputSchema,
  type CreateMasterProductInput,
  type CreateProductVariantInput,
  type UpdateMasterProductInput,
  type UpdateProductVariantInput,
} from '@kiditem/shared/product-operations';
import type { ProductOperationsPort } from '../port/in/product-operations.port';
import {
  PRODUCT_OPERATIONS_REPOSITORY_PORT,
  type NormalizedCreateProductVariant,
  type ProductOperationsRepositoryPort,
} from '../port/out/repository/product-operations.repository.port';

@Injectable()
export class ProductOperationsService implements ProductOperationsPort {
  constructor(
    @Inject(PRODUCT_OPERATIONS_REPOSITORY_PORT)
    private readonly repository: ProductOperationsRepositoryPort,
  ) {}

  listProducts(organizationId: string, rawQuery: unknown) {
    const query = parseOrBadRequest(
      MasterProductOperationsListQuerySchema,
      rawQuery,
      'Invalid product operations query',
    );
    return this.repository.listProducts(organizationId, query);
  }

  getProduct(organizationId: string, masterProductId: string) {
    return this.repository.getProduct(organizationId, masterProductId);
  }

  createProduct(
    organizationId: string,
    userId: string,
    rawInput: unknown,
  ) {
    const input = parseOrBadRequest(
      CreateMasterProductInputSchema,
      rawInput,
      'Invalid MasterProduct creation',
    );
    const variants = input.variants?.map(normalizeVariant) ?? [{
      code: `${input.code.slice(0, 92)}-DEFAULT`,
      name: input.name,
      optionLabel: null,
      isDefault: true,
      isActive: true,
      components: [],
    }];
    return this.repository.createProduct({
      organizationId,
      userId,
      product: { ...input, variants },
    });
  }

  updateProduct(
    organizationId: string,
    masterProductId: string,
    rawInput: unknown,
  ) {
    const input = parseOrBadRequest(
      UpdateMasterProductInputSchema,
      rawInput,
      'Invalid MasterProduct update',
    );
    return this.repository.updateProduct(organizationId, masterProductId, input);
  }

  createVariant(
    organizationId: string,
    userId: string,
    masterProductId: string,
    rawInput: unknown,
  ) {
    const input = parseOrBadRequest(
      CreateProductVariantInputSchema,
      rawInput,
      'Invalid ProductVariant creation',
    );
    return this.repository.createVariant({
      organizationId,
      userId,
      masterProductId,
      variant: normalizeVariant(input),
    });
  }

  updateVariant(
    organizationId: string,
    productVariantId: string,
    rawInput: unknown,
  ) {
    const input = parseOrBadRequest(
      UpdateProductVariantInputSchema,
      rawInput,
      'Invalid ProductVariant update',
    );
    return this.repository.updateVariant(organizationId, productVariantId, input);
  }

  async replaceRecipe(
    organizationId: string,
    userId: string,
    productVariantId: string,
    rawInput: unknown,
  ) {
    const input = parseOrBadRequest(
      ReplaceProductVariantRecipeInputSchema,
      rawInput,
      'Invalid ProductVariant recipe replacement',
    );
    return this.repository.replaceRecipe({
      organizationId,
      userId,
      productVariantId,
      components: input.components,
      expectedRecipe: input.expectedRecipe,
    });
  }
}

function normalizeVariant(
  input: CreateProductVariantInput,
): NormalizedCreateProductVariant {
  return {
    ...input,
    optionLabel: input.optionLabel ?? null,
    isDefault: input.isDefault ?? false,
    isActive: input.isActive ?? true,
    components: input.components ?? [],
  };
}

function parseOrBadRequest<T>(
  schema: { safeParse(input: unknown): { success: true; data: T } | { success: false; error: { flatten(): unknown } } },
  input: unknown,
  message: string,
): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException({ message, errors: parsed.error.flatten() });
  }
  return parsed.data;
}

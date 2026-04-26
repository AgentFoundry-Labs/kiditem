import { z } from 'zod';
import { ProductOptionSchema, type ProductOption } from '@kiditem/shared';
import { apiClient } from '@/lib/api-client';

export interface ProductOptionListParams {
  search?: string;
  isActive?: boolean;
  isBundle?: boolean;
  isTemporary?: boolean;
  isDeleted?: boolean;
  includeDeleted?: boolean;
  masterId?: string;
  limit?: number;
  cursor?: string;
}

export const ProductOptionListResponseSchema = z.object({
  items: z.array(ProductOptionSchema),
  nextCursor: z.string().nullable(),
});
export type ProductOptionListResponse = z.infer<typeof ProductOptionListResponseSchema>;

function searchParamsString(params: ProductOptionListParams): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === null) continue;
    sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export function productOptionListKeyParams(
  params: ProductOptionListParams,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (params.search) result.search = params.search;
  if (params.isActive !== undefined) result.isActive = String(params.isActive);
  if (params.isBundle !== undefined) result.isBundle = String(params.isBundle);
  if (params.isTemporary !== undefined) result.isTemporary = String(params.isTemporary);
  if (params.isDeleted !== undefined) result.isDeleted = String(params.isDeleted);
  if (params.includeDeleted !== undefined) result.includeDeleted = String(params.includeDeleted);
  if (params.masterId) result.masterId = params.masterId;
  if (params.limit !== undefined) result.limit = String(params.limit);
  if (params.cursor) result.cursor = params.cursor;
  return result;
}

export async function fetchProductOptionList(
  params: ProductOptionListParams,
): Promise<ProductOptionListResponse> {
  return apiClient.getParsed(
    `/api/products/options${searchParamsString(params)}`,
    ProductOptionListResponseSchema,
  );
}

/**
 * UpdateOptionDto editable fields. Mirrors the server DTO; barcode is
 * intentionally constrained to the same EAN-13 13-digit pattern that
 * `CreateOptionDto.@Matches(/^\\d{13}$/)` enforces — submitting a non-13-digit
 * value would bounce with HTTP 400 and the user would see no detail.
 */
export interface ProductOptionEditableFields {
  optionName?: string | null;
  legacyCode?: string | null;
  barcode?: string | null;
  costPrice?: number | null;
  sellPrice?: number | null;
  isActive?: boolean;
  isTemporary?: boolean;
  temporaryReason?: string | null;
}

export async function updateProductOption(
  id: string,
  patch: ProductOptionEditableFields,
): Promise<ProductOption> {
  // Strip null → undefined for fields that the server treats as "skip" rather
  // than "clear". Server PATCH whitelist only validates fields that arrive.
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    body[key] = value;
  }
  const raw = await apiClient.patch<unknown>(`/api/products/options/${id}`, body);
  return ProductOptionSchema.parse(raw);
}

export async function softDeleteProductOption(id: string): Promise<void> {
  await apiClient.delete(`/api/products/options/${id}`);
}

export async function restoreProductOption(id: string): Promise<void> {
  await apiClient.post(`/api/products/options/${id}/restore`, {});
}

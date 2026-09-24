import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { salesProductApi } from '@/lib/sales-product-api';
import type { SabangnetImportPreview, SabangnetImportSelection } from '@kiditem/shared/sales-product';

vi.mock('@/lib/api-client', () => ({
  apiClient: { uploadParsed: vi.fn(), fetchRaw: vi.fn() },
}));

const preview = {} as SabangnetImportPreview;
const file = new File(['workbook'], 'products.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

describe('salesProductApi.importSabangnet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends selected existing product ids with the preview versions', async () => {
    const selections: SabangnetImportSelection = [{
      salesProductId: '11111111-1111-4111-8111-111111111111',
      expectedVersion: 4,
    }];
    vi.mocked(apiClient.uploadParsed).mockResolvedValue(preview);

    await expect(salesProductApi.importSabangnet([file], false, selections)).resolves.toBe(preview);

    const [path, , form] = vi.mocked(apiClient.uploadParsed).mock.calls[0]!;
    const query = new URLSearchParams({
      dryRun: 'false',
      applyExisting: JSON.stringify(selections),
    });
    expect(path).toBe(`/api/products/sales-products/imports/sabangnet?${query.toString()}`);
    expect(form.get('files')).toBe(file);
  });

  it('sends an empty selection for the default new-product import', async () => {
    vi.mocked(apiClient.uploadParsed).mockResolvedValue(preview);

    await salesProductApi.importSabangnet([file], true);

    const [path] = vi.mocked(apiClient.uploadParsed).mock.calls[0]!;
    const query = new URLSearchParams({ dryRun: 'true', applyExisting: '[]' });
    expect(path).toBe(`/api/products/sales-products/imports/sabangnet?${query.toString()}`);
  });
});

describe('salesProductApi file downloads — ADR-0023 envelope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the envelope code and Korean message of a refused mall sheet', async () => {
    vi.mocked(apiClient.fetchRaw).mockResolvedValue(Response.json({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      kind: 'validation',
      message: '입력값이 올바르지 않습니다. 표시된 항목을 확인해 주세요.',
      errors: [{ field: 'salesProductIds', reason: '하나 이상 필요합니다.' }],
    }, { status: 400 }));

    await expect(salesProductApi.downloadMallSheet('gmarket', { salesProductIds: [] } as never)).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: '입력값이 올바르지 않습니다. 표시된 항목을 확인해 주세요.',
      errors: [{ field: 'salesProductIds', reason: '하나 이상 필요합니다.' }],
    });
  });

  it('keeps the caller sentence when the failure has no body', async () => {
    vi.mocked(apiClient.fetchRaw).mockResolvedValue(new Response('boom', { status: 500 }));

    await expect(salesProductApi.downloadCoupangCatalog(file)).rejects.toMatchObject({
      status: 500,
      message: '수정요청 파일을 만들지 못했습니다.',
    });
  });
});

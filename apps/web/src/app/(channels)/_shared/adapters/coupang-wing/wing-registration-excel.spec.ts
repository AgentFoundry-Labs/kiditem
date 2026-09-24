import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { requestWingRegistrationWorkbook } from './wing-registration-excel';

vi.mock('@/lib/api-client', () => ({
  apiClient: { fetchRaw: vi.fn() },
}));

const product = {
  categoryCell: '[77390] 완구/취미>스포츠/야외완구>물총',
  productName: '상품',
  brand: '노브랜드',
  maker: '해피프랜즈',
  noticeCategory: '어린이제품',
  variants: [{
    purchaseOptions: [],
    salePrice: 2200,
    stock: 999,
    representativeImageUrl: 'https://cdn.example/rep.png',
  }],
};

describe('WING registration workbook transport', () => {
  beforeEach(() => {
    vi.mocked(apiClient.fetchRaw).mockReset();
  });

  it('uploads the original template and products to the server and returns server bytes', async () => {
    vi.mocked(apiClient.fetchRaw).mockResolvedValue(new Response('server-workbook', {
      status: 200,
      headers: {
        'Content-Disposition': "attachment; filename*=UTF-8''%EC%BF%A0%ED%8C%A1WING_20260907.xlsx",
      },
    }));

    const result = await requestWingRegistrationWorkbook(
      new Uint8Array([1, 2, 3]),
      [product],
      '쿠팡WING_일괄등록_20260907.xlsx',
    );

    expect(result.fileName).toBe('쿠팡WING_20260907.xlsx');
    expect(new TextDecoder().decode(result.bytes)).toBe('server-workbook');
    expect(apiClient.fetchRaw).toHaveBeenCalledTimes(1);
    const [path, init] = vi.mocked(apiClient.fetchRaw).mock.calls[0]!;
    expect(path).toBe('/api/channels/coupang-wing/registration-export');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    expect(form.get('products')).toBe(JSON.stringify([product]));
    expect(form.get('fileName')).toBe('쿠팡WING_일괄등록_20260907.xlsx');
    expect(form.get('template')).toBeInstanceOf(Blob);
  });
});

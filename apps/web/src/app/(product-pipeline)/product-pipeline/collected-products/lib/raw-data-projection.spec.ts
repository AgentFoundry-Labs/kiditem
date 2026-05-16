import { describe, expect, it } from 'vitest';
import { projectRawData } from './raw-data-projection';

describe('projectRawData', () => {
  it('projects nested baseline representative rows into raw display fields', () => {
    const projection = projectRawData({
      rawData: {
        source: 'kiditem-baseline',
        rowNumbers: [1907],
        sourceBarcode: '8806384808919',
        representativeRow: {
          상품명: '쭉쭉붙이는터치등',
          상품코드: '10349-1',
          판매가: 8250,
          재고: 60,
        },
      },
      imageUrls: [],
      thumbnailUrl: null,
    });

    expect(projection.title).toBe('쭉쭉붙이는터치등');
    expect(projection.price).toEqual({ min: 8250, max: 8250, unit: 'KRW' });
    expect(projection.fieldGroups).toEqual([
      {
        title: '원본 행 데이터',
        rows: [
          { key: '상품명', value: '쭉쭉붙이는터치등' },
          { key: '상품코드', value: '10349-1' },
          { key: '판매가', value: '8250' },
          { key: '재고', value: '60' },
        ],
      },
    ]);
  });
});

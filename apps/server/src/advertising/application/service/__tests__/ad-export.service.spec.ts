import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { AdExportService } from '../ad-export.service';

const LISTING_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';

function action(overrides: Record<string, unknown> = {}) {
  return {
    listing: {
      listingId: LISTING_ID,
      externalId: 'PRODUCT-1',
      channelName: '테스트 상품',
      masterProduct: {
        id: PRODUCT_ID,
        code: 'MASTER-1',
        name: '마스터 상품',
      },
      option: null,
    },
    grade: 'A',
    actionType: 'increase',
    priority: 'high',
    reason: '성과 근거',
    currentValue: 200,
    proposedValue: 1500,
    channelState: null,
    ...overrides,
  };
}

function sheetRows(buffer: Buffer): unknown[][] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
}

describe('AdExportService', () => {
  it('preserves campaign grade sheets, columns, labels, and filename', () => {
    const result = new AdExportService().exportCampaign(
      {
        grade: 'A',
        actions: [action()],
        budget: 100_000,
      } as never,
      new Date('2026-07-31T12:00:00.000Z'),
    );

    const workbook = XLSX.read(result.buffer, { type: 'buffer' });
    expect(result.fileName).toBe('광고캠페인_A등급_20260731.xlsx');
    expect(result.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(workbook.SheetNames).toEqual(['A등급 캠페인']);
    expect(sheetRows(result.buffer)).toEqual([
      [
        'No', '캠페인명', '상품명', '등록상품ID', '등급', '현재값', '제안값',
        '추천 일예산(원)', '목표 ROAS(%)', '캠페인 유형', '메인 키워드 입찰가',
        '서브 키워드 입찰가', '롱테일 키워드 입찰가', '추천 액션', '우선순위',
        '사유', '채널상태일', '아이템위너',
      ],
      [
        1, 'A등급_캠페인', '테스트 상품', 'PRODUCT-1', 'A', 200, 1500, 1500,
        '300~500%', '매출최적화 + 수동 병행', '800~1,000원', '500~700원',
        '200~400원', '확대', '높음', '성과 근거', '', '',
      ],
    ]);
  });

  it('preserves all-grade placeholders and per-grade budget allocation', () => {
    const result = new AdExportService().exportCampaign(
      {
        grade: 'all',
        actions: [action({ proposedValue: null })],
        budget: 100_000,
      } as never,
      new Date('2026-07-31T12:00:00.000Z'),
    );
    const workbook = XLSX.read(result.buffer, { type: 'buffer' });
    expect(result.fileName).toBe('광고캠페인_ABC_20260731.xlsx');
    expect(workbook.SheetNames).toEqual(['A등급 캠페인', 'B등급 캠페인', 'C등급 캠페인']);
    expect(sheetRows(result.buffer)[1]?.[7]).toBe(65_000);
    const bRows = XLSX.utils.sheet_to_json(
      workbook.Sheets['B등급 캠페인'],
      { header: 1, defval: '' },
    ) as unknown[][];
    expect(bRows[1]?.[2]).toBe('(해당 상품 없음)');
  });

  it('converts the selected trend series without persisting output', () => {
    const result = new AdExportService().exportTrend({
      period: '7d',
      leftMetric: 'spend',
      rightMetric: 'roas',
      leftLabel: '집행 광고비',
      rightLabel: '광고 수익률(ROAS)',
      points: [{
        businessDate: '2026-07-31',
        axisLabel: '07/31(금)',
        leftValue: 1000,
        rightValue: 250,
      }],
    });
    expect(result.fileName).toBe('광고-성과그래프-7d.xlsx');
    expect(sheetRows(result.buffer)).toEqual([
      ['일자', '요일', '집행 광고비', '광고 수익률(ROAS)'],
      // Preserve the browser export's legacy `slice(-3, -1)` value, including
      // the opening parenthesis from `07/31(금)`.
      ['2026-07-31', '(금', 1000, 250],
    ]);
  });

  it('rejects an action shape that is not from the advertising API contract', () => {
    expect(() => new AdExportService().exportCampaign({
      grade: 'A',
      actions: [{}],
      budget: 1,
    } as never)).toThrow('광고 캠페인 내보내기 데이터가 유효하지 않습니다.');
  });
});

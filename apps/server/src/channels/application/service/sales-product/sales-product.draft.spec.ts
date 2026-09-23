import { describe, expect, it } from 'vitest';
import { SalesProductUseCase } from './sales-product.usecase';
import { untouchedDraftDeletionPorts } from '../../../../test-helpers/sales-product-draft-port';
import type { SalesProduct } from '@kiditem/shared/sales-product';
import type { SalesProductOptionReplacementPlan } from '../../../domain/sales-product/sales-product';
import type {
  SalesProductBasicsRecord,
  SalesProductCreateRecord,
  SalesProductRepositoryPort,
} from '../../port/out/persistence/sales-product.repository.port';

const ORG = '11111111-1111-1111-1111-111111111111';
const SOURCE_RECORD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

interface Row {
  id: string;
  code: string | null;
  version: number;
  status: string;
  name: string;
  imageUrls: string[];
  description: string;
  sourceRecordId: string | null;
  sourcePlatform: string | null;
  sourceUrl: string | null;
  sourceRaw: Record<string, unknown> | null;
  optionAxes: string[];
  options: { id: string; optionCode: string | null; optionKey: string; values: string[]; supplyStatus: string; salePrice: number | null }[];
}

function setup(rows: Row[] = []) {
  let issued = 0;
  const plans: SalesProductOptionReplacementPlan[] = [];
  const write = (row: Row, plan: SalesProductOptionReplacementPlan) => {
    row.options = plan.writes.map((option, index) => ({
      id: `${row.id}-o${index}`,
      optionCode: option.optionCode,
      optionKey: option.optionKey,
      values: option.values,
      supplyStatus: option.supplyStatus,
      salePrice: option.salePrice,
    }));
  };
  const repository = {
    allocateCode: async () => `KID${String(++issued).padStart(8, '0')}`,
    readMasterProductCodes: async () => new Map(),
    findInvalidMasterProductIds: async () => [],
    listCodesWithPrefix: async () => [],
    findIdBySourceCandidate: async (_org: string, candidateId: string) =>
      rows.find((row) => row.sourceRecordId === candidateId)?.id ?? null,
    get: async (_org: string, id: string) => {
      const row = rows.find((candidate) => candidate.id === id);
      return row ? (row as unknown as SalesProduct) : null;
    },
    create: async (_org: string, record: SalesProductCreateRecord, plan: SalesProductOptionReplacementPlan) => {
      plans.push(plan);
      const id = `new-${rows.length + 1}`;
      const row: Row = {
        id,
        code: record.code,
        version: 1,
        status: record.status,
        name: record.name,
        imageUrls: record.imageUrls,
        description: record.description,
        sourceRecordId: record.sourceRecordId ?? null,
        sourcePlatform: record.sourcePlatform ?? null,
        sourceUrl: record.sourceUrl ?? null,
        sourceRaw: record.sourceRaw,
        optionAxes: record.optionAxes,
        options: [],
      };
      rows.push(row);
      write(row, plan);
      return id;
    },
    updateBasics: async (_org: string, id: string, version: number, patch: Partial<SalesProductBasicsRecord>) => {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row || row.version !== version) return false;
      Object.assign(row, patch, { version: row.version + 1 });
      return true;
    },
    readOptionState: async (_org: string, id: string) => {
      const row = rows.find((candidate) => candidate.id === id);
      return row
        ? {
          productId: row.id,
          productCode: row.code,
          productName: row.name,
          status: row.status,
          version: row.version,
          options: row.options.map((option) => ({ ...option, linkedChannelOptionCount: 0 })),
        }
        : null;
    },
    applyOptionPlan: async (input: { salesProductId: string; expectedVersion: number; optionAxes: string[]; plan: SalesProductOptionReplacementPlan }) => {
      const row = rows.find((candidate) => candidate.id === input.salesProductId);
      if (!row || row.version !== input.expectedVersion) return false;
      row.optionAxes = input.optionAxes;
      row.version += 1;
      write(row, input.plan);
      return true;
    },
  } as unknown as SalesProductRepositoryPort;
  return { rows, plans, repository, service: new SalesProductUseCase(repository, ...untouchedDraftDeletionPorts) };
}

const source = {
  sourceRecordId: SOURCE_RECORD,
  name: '비눗방울총',
  description: '수집한 설명',
  imageUrls: ['https://img.example.com/a.jpg'],
  sourcePlatform: '1688',
  sourceUrl: 'https://detail.1688.com/offer/1.html',
};

describe('SalesProductUseCase.createDraft', () => {
  it('원본 한 줄에서 판매가도 KID 도 없는 초안을 만들고, 원가 · 원문은 복사하지 않는다', async () => {
    const { rows, service } = setup();
    await service.createDraft(ORG, source);
    expect(rows[0]).toMatchObject({
      code: null,
      status: 'draft',
      name: '비눗방울총',
      description: '수집한 설명',
      sourceRecordId: SOURCE_RECORD,
      sourcePlatform: '1688',
      sourceUrl: 'https://detail.1688.com/offer/1.html',
      sourceRaw: null,
      optionAxes: [],
    });
    expect(rows[0]!.options).toEqual([
      expect.objectContaining({ optionCode: null, salePrice: null, supplyStatus: 'selling' }),
    ]);
  });

  it('원천 옵션 이름이 있으면 한 단짜리 옵션으로 편다', async () => {
    const { rows, service } = setup();
    await service.createDraft(ORG, { ...source, optionNames: ['빨강', '파랑'] });
    expect(rows[0]!.optionAxes).toEqual(['옵션']);
    expect(rows[0]!.options.map((option) => option.values)).toEqual([['빨강'], ['파랑']]);
  });

  /** 직접 작성은 원본 기록이 없고, 사람이 적은 판매가를 모든 옵션이 받는다(KID-313). */
  it('직접 작성 초안은 원본 기록 없이 사람이 적은 판매가를 받는다', async () => {
    const { rows, service } = setup();
    await service.createDraft(ORG, {
      sourceRecordId: null, name: '직접 만든 상품', sourcePlatform: 'KIDITEM_PRODUCT_REGISTRATION',
      optionNames: ['기본'], salePrice: 9900, normalPrice: 12000,
    });
    expect(rows[0]).toMatchObject({ sourceRecordId: null, status: 'draft', code: null });
    expect(rows[0]!.options.map((option) => option.salePrice)).toEqual([9900]);
  });

  /**
   * 원천은 칸 너비를 지킨 적이 없다(1688 이름은 흔히 255 자를 넘는다). 거절하면 수집이 막히므로
   * 칸 너비로 잘라서 받는다.
   */
  it('칸보다 긴 원천 이름 · 장터는 칸 너비로 잘라서 담는다', async () => {
    const { rows, service } = setup();
    await service.createDraft(ORG, {
      ...source,
      name: '가'.repeat(300),
      sourcePlatform: '1688'.repeat(20),
    });
    expect(rows[0]!.name).toBe('가'.repeat(255));
    expect(rows[0]!.sourcePlatform).toBe('1688'.repeat(20).slice(0, 40));
  });
});

describe('SalesProductUseCase.replaceOptions', () => {
  /** 상태는 가격이 아니라 KID 가 정한다(KID-313). 값을 다 채워도 초안은 초안이다. */
  it('판매가를 다 채워도 상태를 건드리지 않는다 — 초안은 KID 를 받을 때 판매 상품이 된다', async () => {
    const { rows, service } = setup();
    const draftId = await service.createDraft(ORG, { ...source, optionNames: ['빨강', '파랑'] });
    await service.replaceOptions(ORG, draftId, {
      expectedVersion: rows[0]!.version,
      optionAxes: ['옵션'],
      options: [
        { values: ['빨강'], salePrice: 9900 },
        { values: ['파랑'], salePrice: 10900 },
      ],
    });
    expect(rows[0]!.status).toBe('draft');
    expect(rows[0]!.options.map((option) => option.salePrice)).toEqual([9900, 10900]);
  });
});

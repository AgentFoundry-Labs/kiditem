import { describe, expect, it, vi } from 'vitest';
import { SalesProductUseCase } from './sales-product.usecase';
import type { SalesProduct } from '@kiditem/shared/sales-product';
import type { SalesProductOptionReplacementPlan } from '../../../domain/sales-product/sales-product';
import type {
  SalesProductBasicsRecord,
  SalesProductCreateRecord,
  SalesProductRepositoryPort,
} from '../../port/out/persistence/sales-product.repository.port';

const ORG = '11111111-1111-1111-1111-111111111111';
const CANDIDATE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

interface Row {
  id: string;
  code: string | null;
  version: number;
  status: string;
  name: string;
  imageUrls: string[];
  description: string;
  sourceCandidateId: string | null;
  sourcePlatform: string | null;
  sourceUrl: string | null;
  sourceRaw: Record<string, unknown> | null;
  optionAxes: string[];
  options: { id: string; optionCode: string | null; optionKey: string; values: string[]; supplyStatus: string; salePrice: number | null }[];
}

function setup(rows: Row[] = [], options: { raceOn?: string } = {}) {
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
      rows.find((row) => row.sourceCandidateId === candidateId)?.id ?? null,
    get: async (_org: string, id: string) => {
      const row = rows.find((candidate) => candidate.id === id);
      return row ? (row as unknown as SalesProduct) : null;
    },
    create: async (_org: string, record: SalesProductCreateRecord, plan: SalesProductOptionReplacementPlan) => {
      plans.push(plan);
      if (record.sourceCandidateId === options.raceOn) {
        rows.push({
          id: 'raced', code: 'KID00009999', version: 1, status: 'draft', name: record.name,
          imageUrls: [], description: '', sourceCandidateId: options.raceOn!, sourcePlatform: null,
          sourceUrl: null, sourceRaw: null, optionAxes: [], options: [],
        });
        throw new Error('unique violation');
      }
      const id = `new-${rows.length + 1}`;
      const row: Row = {
        id,
        code: record.code,
        version: 1,
        status: record.status,
        name: record.name,
        imageUrls: record.imageUrls,
        description: record.description,
        sourceCandidateId: record.sourceCandidateId ?? null,
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
    applyOptionPlan: async (input: { salesProductId: string; expectedVersion: number; optionAxes: string[]; plan: SalesProductOptionReplacementPlan; status: string }) => {
      const row = rows.find((candidate) => candidate.id === input.salesProductId);
      if (!row || row.version !== input.expectedVersion) return false;
      row.optionAxes = input.optionAxes;
      row.status = input.status;
      row.version += 1;
      write(row, input.plan);
      return true;
    },
    retireDraftForSource: async (_tx: unknown, _org: string, candidateId: string) => {
      const row = rows.find((candidate) => candidate.sourceCandidateId === candidateId);
      if (!row) return { salesProductId: null, retired: false, activeListingCount: 0, activeExecutionCount: 0 };
      if (row.name === '몰에 올라간 상품') {
        return { salesProductId: row.id, retired: false, activeListingCount: 1, activeExecutionCount: 0 };
      }
      row.status = 'unused';
      return { salesProductId: row.id, retired: true, activeListingCount: 0, activeExecutionCount: 0 };
    },
  } as unknown as SalesProductRepositoryPort;
  const workspaceArchive = { archiveSalesProductWorkspace: vi.fn().mockResolvedValue(undefined) };
  return { rows, plans, workspaceArchive, service: new SalesProductUseCase(repository, workspaceArchive) };
}

/** 부르는 쪽(Sourcing)이 넘기는 불투명한 트랜잭션 손잡이. 안을 들여다보지 않는다. */
const TX = { opaque: true } as never;

const source = {
  candidateId: CANDIDATE,
  name: '비눗방울총',
  description: '수집한 설명',
  imageUrls: ['https://img.example.com/a.jpg'],
  sourcePlatform: '1688',
  sourceUrl: 'https://detail.1688.com/offer/1.html',
  costCny: 12.5,
};

describe('SalesProductUseCase.createFromSource', () => {
  it('원천 한 줄에서 판매가도 KID 도 없는 초안을 만든다', async () => {
    const { rows, service } = setup();
    await service.createFromSource(ORG, source);
    // 수집 초안은 KID 없이 만들어진다 — 팔기로 정할 때 발급한다.
    expect(rows[0]).toMatchObject({
      code: null,
      status: 'draft',
      name: '비눗방울총',
      description: '수집한 설명',
      sourceCandidateId: CANDIDATE,
      sourcePlatform: '1688',
      sourceUrl: 'https://detail.1688.com/offer/1.html',
      optionAxes: [],
    });
    expect(rows[0]!.options).toEqual([
      expect.objectContaining({ optionCode: null, salePrice: null, supplyStatus: 'selling' }),
    ]);
  });

  it('원가를 포함한 원문을 초안의 sourceRaw 로 얼려 둔다', async () => {
    const { rows, service } = setup();
    await service.createFromSource(ORG, { ...source, rawBasics: { title: '原文' } });
    expect(rows[0]!.sourceRaw).toEqual({ costCny: 12.5, title: '原文' });
  });

  it('원천 옵션 이름이 있으면 한 단짜리 옵션으로 편다', async () => {
    const { rows, service } = setup();
    await service.createFromSource(ORG, { ...source, optionNames: ['빨강', '파랑'] });
    expect(rows[0]!.optionAxes).toEqual(['옵션']);
    expect(rows[0]!.options.map((option) => option.values)).toEqual([['빨강'], ['파랑']]);
  });

  it('같은 후보를 다시 부르면 이미 만든 초안을 그대로 돌려준다', async () => {
    const { rows, service } = setup();
    const first = await service.createFromSource(ORG, source);
    const again = await service.createFromSource(ORG, { ...source, name: '다시 수집한 이름' });
    expect(again.id).toBe(first.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('비눗방울총');
  });

  it('다른 요청이 같은 후보로 먼저 만들었으면 그 초안을 돌려준다', async () => {
    const { service } = setup([], { raceOn: CANDIDATE });
    await expect(service.createFromSource(ORG, source)).resolves.toMatchObject({ id: 'raced' });
  });
});

describe('SalesProductUseCase.replaceOptions', () => {
  it('판매가를 비워 둘 수 있고 그 저장은 상품을 draft 로 둔다', async () => {
    const { rows, service } = setup();
    const draft = await service.createFromSource(ORG, { ...source, optionNames: ['빨강', '파랑'] });
    await service.replaceOptions(ORG, draft.id, {
      expectedVersion: rows[0]!.version,
      optionAxes: ['옵션'],
      options: [
        { values: ['빨강'], salePrice: 9900 },
        { values: ['파랑'], salePrice: null },
      ],
    });
    expect(rows[0]!.status).toBe('draft');
  });

  it('팔 옵션에 값이 다 차면 저장이 상품을 active 로 올린다 — 별도 확정 버튼이 없다', async () => {
    const { rows, service } = setup();
    const draft = await service.createFromSource(ORG, { ...source, optionNames: ['빨강', '파랑'] });
    await service.replaceOptions(ORG, draft.id, {
      expectedVersion: rows[0]!.version,
      optionAxes: ['옵션'],
      options: [
        { values: ['빨강'], salePrice: 9900 },
        { values: ['파랑'], salePrice: 10900 },
      ],
    });
    expect(rows[0]!.status).toBe('active');
  });

  it('사람이 정한 상태(보관)는 값이 차도 올리지 않는다', async () => {
    const { rows, service } = setup();
    const draft = await service.createFromSource(ORG, source);
    rows[0]!.status = 'archived';
    await service.replaceOptions(ORG, draft.id, {
      expectedVersion: rows[0]!.version,
      optionAxes: [],
      options: [{ values: [], salePrice: 9900 }],
    });
    expect(rows[0]!.status).toBe('archived');
  });
});

describe('SalesProductUseCase.retireDraftForSource', () => {
  it('후보를 거절하면 그 초안을 unused 로 내리고 콘텐츠 작업공간도 보관한다', async () => {
    const { rows, service, workspaceArchive } = setup();
    await service.createFromSource(ORG, source);
    await expect(service.retireDraftForSource(TX, ORG, CANDIDATE))
      .resolves.toEqual({ salesProductId: rows[0]!.id, retired: true, blockedReason: null });
    expect(rows[0]!.status).toBe('unused');
    expect(workspaceArchive.archiveSalesProductWorkspace).toHaveBeenCalledWith(TX, {
      organizationId: ORG,
      salesProductId: rows[0]!.id,
      archivedAt: expect.any(Date),
    });
  });

  it('몰에 올라가 있으면 내리지 않고 이유를 돌려준다 — 후보 거절을 막지는 않는다', async () => {
    const { rows, service, workspaceArchive } = setup();
    await service.createFromSource(ORG, { ...source, name: '몰에 올라간 상품' });
    const result = await service.retireDraftForSource(TX, ORG, CANDIDATE);
    expect(result.retired).toBe(false);
    expect(result.blockedReason).toContain('몰');
    expect(rows[0]!.status).toBe('draft');
    // 몰에 남아 있으면 작업공간도 그대로 둔다.
    expect(workspaceArchive.archiveSalesProductWorkspace).not.toHaveBeenCalled();
  });

  it('초안이 없는 후보는 조용히 지나간다', async () => {
    const { service } = setup();
    await expect(service.retireDraftForSource(TX, ORG, CANDIDATE))
      .resolves.toEqual({ salesProductId: null, retired: false, blockedReason: null });
  });
});

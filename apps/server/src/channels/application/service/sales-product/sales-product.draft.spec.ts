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
  sourceRecordId: string | null;
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
      rows.find((row) => row.sourceRecordId === candidateId)?.id ?? null,
    get: async (_org: string, id: string) => {
      const row = rows.find((candidate) => candidate.id === id);
      return row ? (row as unknown as SalesProduct) : null;
    },
    create: async (_org: string, record: SalesProductCreateRecord, plan: SalesProductOptionReplacementPlan) => {
      plans.push(plan);
      if (record.sourceRecordId === options.raceOn) {
        rows.push({
          id: 'raced', code: 'KID00009999', version: 1, status: 'draft', name: record.name,
          imageUrls: [], description: '', sourceRecordId: options.raceOn!, sourcePlatform: null,
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
    retireDraftForSource: async (_tx: unknown, _org: string, candidateId: string) => {
      const row = rows.find((candidate) => candidate.sourceRecordId === candidateId);
      if (!row) return { salesProductId: null, retired: false, activeListingCount: 0, activeExecutionCount: 0 };
      if (row.name === '몰에 올라간 상품') {
        return { salesProductId: row.id, retired: false, activeListingCount: 1, activeExecutionCount: 0 };
      }
      row.status = 'unused';
      return { salesProductId: row.id, retired: true, activeListingCount: 0, activeExecutionCount: 0 };
    },
  } as unknown as SalesProductRepositoryPort;
  const workspaceArchive = { archiveSalesProductWorkspace: vi.fn().mockResolvedValue(undefined) };
  return { rows, plans, repository, workspaceArchive, service: new SalesProductUseCase(repository, workspaceArchive) };
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
      sourceRecordId: CANDIDATE,
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

  /**
   * 원천은 칸 너비를 지킨 적이 없다(1688 이름은 흔히 255 자를 넘는다). 거절하면 수집이 막히므로
   * 이관과 같은 규칙으로 잘라서 받는다.
   */
  /**
   * 수집은 후보와 초안을 한 커밋에 넣는다. 초안 만들기가 실패하면 부르는 쪽 트랜잭션은 이미
   * 중단돼 있어 더 읽을 수 없으므로, 여기서 기존 초안을 찾아보지 않고 그대로 올린다.
   */
  it('부르는 쪽 트랜잭션이면 초안을 만들다 난 오류를 그대로 올린다', async () => {
    const { repository, service } = setup([], { raceOn: CANDIDATE });
    const lookups: (unknown)[] = [];
    const findId = repository.findIdBySourceCandidate.bind(repository);
    repository.findIdBySourceCandidate = async (org: string, candidateId: string, tx?: unknown) => {
      lookups.push(tx);
      return findId(org, candidateId, tx as never);
    };

    await expect(service.createFromSource(ORG, source, TX)).rejects.toThrow('unique violation');
    // 트랜잭션 없이 부를 때만 다시 찾는다 — 중단된 트랜잭션에서는 더 읽을 수 없다.
    expect(lookups).toEqual([TX]);
  });

  it('칸보다 긴 원천 이름 · 장터는 칸 너비로 잘라서 담는다', async () => {
    const { rows, service } = setup();
    await service.createFromSource(ORG, {
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
    const draft = await service.createFromSource(ORG, { ...source, optionNames: ['빨강', '파랑'] });
    await service.replaceOptions(ORG, draft.id, {
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

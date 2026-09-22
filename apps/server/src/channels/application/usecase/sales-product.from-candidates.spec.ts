import { describe, expect, it } from 'vitest';
import { SalesProductUseCase } from './sales-product.usecase';
import type { SalesProductOptionReplacementPlan } from '../../domain/sales-product';
import type {
  SalesProductBasicsRecord,
  SalesProductCreateRecord,
  SalesProductRepositoryPort,
} from '../port/out/persistence/sales-product.repository.port';

const ORG = '11111111-1111-1111-1111-111111111111';
const CANDIDATE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CANDIDATE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

interface Row {
  id: string;
  code: string;
  version: number;
  status?: string;
  imageUrls: string[];
  detailHtml: string | null;
  name: string;
  sourceCandidateId: string | null;
}

function product(name: string, imageUrls: string[] = [], detailHtml: string | null = null) {
  return { name, imageUrls, detailHtml, optionAxes: [], options: [{ values: [], salePrice: 3000 }] };
}

function setup(rows: Row[] = [], options: { raceOn?: string } = {}) {
  let issued = 0;
  const plans: SalesProductOptionReplacementPlan[] = [];
  const repository = {
    allocateCode: async () => `KID${String(++issued).padStart(8, "0")}`,
    readMasterProductCodes: async () => new Map([['cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'KID00000888']]),
    findInvalidMasterProductIds: async () => [],
    listCodesWithPrefix: async (_org: string, prefix: string) => rows.map((row) => row.code).filter((code) => code.startsWith(prefix)),
    findBySourceCandidates: async (_org: string, ids: readonly string[]) => new Map(rows
      .filter((row) => row.sourceCandidateId && ids.includes(row.sourceCandidateId))
      .map((row) => [row.sourceCandidateId!, { status: 'active', ...row, imageUrls: [...row.imageUrls] }])),
    create: async (_org: string, record: SalesProductCreateRecord, plan: SalesProductOptionReplacementPlan) => {
      plans.push(plan);
      if (record.sourceCandidateId === options.raceOn) {
        // 다른 요청이 같은 수집상품으로 먼저 만들었다.
        rows.push({ id: 'raced', code: 'K000099', version: 1, imageUrls: [], detailHtml: null, name: record.name, sourceCandidateId: options.raceOn! });
        throw new Error('unique violation');
      }
      const id = `new-${rows.length + 1}`;
      rows.push({
        id,
        code: record.code,
        version: 1,
        imageUrls: record.imageUrls,
        detailHtml: record.detailHtml ?? null,
        name: record.name,
        sourceCandidateId: record.sourceCandidateId ?? null,
      });
      return id;
    },
    updateBasics: async (_org: string, id: string, version: number, patch: Partial<SalesProductBasicsRecord>) => {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row || row.version !== version) return false;
      Object.assign(row, patch, { version: row.version + 1 });
      return true;
    },
  } as unknown as SalesProductRepositoryPort;
  return { rows, plans, service: new SalesProductUseCase(repository) };
}

describe('SalesProductUseCase.createFromCandidates', () => {
  it('issues option KIDs and reuses a known singleton source code only on first creation', async () => {
    const { service, plans } = setup();
    const source = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await service.createFromCandidates(ORG, { items: [{ candidateId: CANDIDATE_A, product: {
      ...product('구성 상품'), optionAxes: ['구성'], options: [
        { values: ['단품'], salePrice: 3000, components: [{ masterProductId: source, quantity: 1 }] },
        { values: ['묶음'], salePrice: 6000, components: [{ masterProductId: source, quantity: 2 }] },
        { values: ['미연결'], salePrice: 4000, optionCode: 'CLIENT-CODE' },
      ],
    } }] });
    expect(plans[0].writes.map(option => option.optionCode)).toEqual(['KID00000888', 'KID00000002', 'KID00000003']);
  });

  it('makes one sales product per collected product with globally issued KID codes', async () => {
    const { rows, service } = setup([
      { id: 'old', code: 'K000007', version: 1, imageUrls: [], detailHtml: null, name: '옛 상품', sourceCandidateId: null },
    ]);
    const result = await service.createFromCandidates(ORG, {
      items: [
        { candidateId: CANDIDATE_A, product: product('비눗방울총', ['https://img.example.com/a.jpg']) },
        { candidateId: CANDIDATE_B, product: product('버블 머신') },
      ],
    });
    expect(result).toMatchObject({ created: 2, reused: 0 });
    expect(result.products.map((item) => item.code)).toEqual(['KID00000001', 'KID00000003']);
    expect(rows.filter((row) => row.sourceCandidateId).map((row) => row.sourceCandidateId)).toEqual([CANDIDATE_A, CANDIDATE_B]);
  });

  it('reuses the sales product made from the same collected product and only fills what is empty', async () => {
    const { rows, service } = setup([
      { id: 'made', code: 'K000001', version: 3, imageUrls: [], detailHtml: '<p>사람이 고친 상세</p>', name: '고친 이름', sourceCandidateId: CANDIDATE_A },
    ]);
    const result = await service.createFromCandidates(ORG, {
      items: [{ candidateId: CANDIDATE_A, product: product('수집 이름', ['https://img.example.com/a.jpg'], '<p>수집 상세</p>') }],
    });
    expect(result).toMatchObject({ created: 0, reused: 1, products: [{ salesProductId: 'made', code: 'K000001', created: false }] });
    expect(rows[0]).toMatchObject({
      name: '고친 이름',
      detailHtml: '<p>사람이 고친 상세</p>',
      imageUrls: ['https://img.example.com/a.jpg'],
      version: 4,
    });
  });

  it('answers with the product another request made first for the same collected product', async () => {
    const { service } = setup([], { raceOn: CANDIDATE_A });
    const result = await service.createFromCandidates(ORG, {
      items: [{ candidateId: CANDIDATE_A, product: product('비눗방울총') }],
    });
    expect(result.products).toEqual([{ candidateId: CANDIDATE_A, salesProductId: 'raced', code: 'K000099', created: false }]);
  });

  it('revives a sales product that was sent back to the collected products, keeping its code', async () => {
    const { rows, service } = setup([
      { id: 'made', code: 'K000004', version: 2, status: 'archived', imageUrls: ['https://img.example.com/a.jpg'], detailHtml: '<p>상세</p>', name: '되돌린 상품', sourceCandidateId: CANDIDATE_A },
    ]);
    const result = await service.createFromCandidates(ORG, {
      items: [{ candidateId: CANDIDATE_A, product: product('되돌린 상품', ['https://img.example.com/b.jpg']) }],
    });
    expect(result.products).toEqual([{ candidateId: CANDIDATE_A, salesProductId: 'made', code: 'K000004', created: false }]);
    expect(rows[0]).toMatchObject({ status: 'active', imageUrls: ['https://img.example.com/a.jpg'], version: 3 });
  });

  it('refuses the same collected product twice in one request', async () => {
    const { service } = setup();
    await expect(service.createFromCandidates(ORG, {
      items: [
        { candidateId: CANDIDATE_A, product: product('하나') },
        { candidateId: CANDIDATE_A, product: product('둘') },
      ],
    })).rejects.toThrow('같은 수집상품이 두 번 있습니다.');
  });
});

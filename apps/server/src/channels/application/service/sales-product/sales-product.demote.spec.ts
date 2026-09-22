import { describe, expect, it } from 'vitest';
import { SalesProductUseCase } from './sales-product.usecase';
import type {
  SalesProductBasicsRecord,
  SalesProductRepositoryPort,
} from '../../port/out/persistence/sales-product.repository.port';

const ORG = '11111111-1111-1111-1111-111111111111';
const CANDIDATE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

interface Row {
  id: string;
  code: string;
  version: number;
  status: string;
  sourceCandidateId: string | null;
  channelListings: { isActive: boolean }[];
  options: { linkedChannelOptionCount: number }[];
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'sp-1',
    code: 'K000001',
    version: 3,
    status: 'active',
    sourceCandidateId: CANDIDATE,
    channelListings: [],
    options: [{ linkedChannelOptionCount: 0 }],
    ...overrides,
  };
}

function setup(initial: Row) {
  const rows = [initial];
  const repository = {
    get: async (_org: string, id: string) => rows.find((item) => item.id === id) ?? null,
    updateBasics: async (_org: string, id: string, version: number, patch: Partial<SalesProductBasicsRecord>) => {
      const found = rows.find((item) => item.id === id);
      if (!found || found.version !== version) return false;
      Object.assign(found, patch, { version: found.version + 1 });
      return true;
    },
  } as unknown as SalesProductRepositoryPort;
  return { rows, service: new SalesProductUseCase(repository) };
}

describe('SalesProductUseCase.demoteToCandidate', () => {
  it('sends a sales product made from a collected product back without deleting it', async () => {
    const { rows, service } = setup(row());
    const result = await service.demoteToCandidate(ORG, 'sp-1', { expectedVersion: 3 });
    expect(result).toMatchObject({ status: 'archived', code: 'K000001', version: 4 });
    expect(rows).toHaveLength(1);
  });

  it('only sends back sales products that came from a collected product', async () => {
    const { service } = setup(row({ sourceCandidateId: null }));
    await expect(service.demoteToCandidate(ORG, 'sp-1', { expectedVersion: 3 }))
      .rejects.toThrow('수집상품에서 만든 판매상품만');
  });

  it('refuses while a mall listing or a mall option is linked', async () => {
    const listed = setup(row({ channelListings: [{ isActive: true }] }));
    await expect(listed.service.demoteToCandidate(ORG, 'sp-1', { expectedVersion: 3 })).rejects.toThrow('몰에 올라간 상품과 이어져');
    const optionLinked = setup(row({ options: [{ linkedChannelOptionCount: 1 }] }));
    await expect(optionLinked.service.demoteToCandidate(ORG, 'sp-1', { expectedVersion: 3 })).rejects.toThrow('몰에 올라간 상품과 이어져');
    const removedListing = setup(row({ channelListings: [{ isActive: false }] }));
    await expect(removedListing.service.demoteToCandidate(ORG, 'sp-1', { expectedVersion: 3 })).resolves.toMatchObject({ status: 'archived' });
  });

  it('refuses a stale version and answers an already sent-back product as it is', async () => {
    const stale = setup(row());
    await expect(stale.service.demoteToCandidate(ORG, 'sp-1', { expectedVersion: 2 })).rejects.toThrow('다른 곳에서 먼저 고쳤습니다');
    const done = setup(row({ status: 'archived' }));
    await expect(done.service.demoteToCandidate(ORG, 'sp-1', { expectedVersion: 1 })).resolves.toMatchObject({ status: 'archived', version: 3 });
  });
});

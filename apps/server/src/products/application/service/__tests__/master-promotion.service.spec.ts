import { describe, expect, it, vi } from 'vitest';
import { MasterPromotionService } from '../master-promotion.service';

const ORGANIZATION_ID = 'org-1';
const MASTER_ID = 'master-1';
const MASTER_CODE = 'M-00000001';

function buildInput(overrides: Partial<{
  options: Array<Record<string, unknown>>;
  sourceImages: Array<Record<string, unknown>>;
}> = {}) {
  return {
    candidateSnapshot: {
      name: 'Toy',
      description: 'A toy description',
      category: 'Toys',
      brand: 'KidsCo',
      tags: ['plastic', 'kids'],
      thumbnailUrl: 'https://example.com/thumb.jpg',
      imageUrl: 'https://example.com/main.jpg',
      sourceImages: overrides.sourceImages ?? [
        {
          url: 'https://example.com/0.jpg',
          storageKey: null,
          sortOrder: 0,
          isPrimary: true,
          source: 'sourcing-extension',
          role: 'product',
          label: null,
        },
        {
          url: 'https://example.com/1.jpg',
          storageKey: 'storage/1.jpg',
          sortOrder: 1,
          isPrimary: false,
          source: 'sourcing-extension',
          role: 'product',
          label: null,
        },
      ],
    },
    options: overrides.options ?? [
      { optionName: 'Red', sortOrder: 0 },
      { optionName: 'Blue', legacyCode: 'LC-2', sortOrder: 1 },
    ],
  } as any;
}

function buildService() {
  const tx = { tx: true };
  const masters = {
    createPromoted: vi.fn().mockResolvedValue({ id: MASTER_ID }),
  };
  const codeSvc = { generate: vi.fn().mockResolvedValue(MASTER_CODE) };
  const transactions = {
    run: vi.fn(async (cb: (txArg: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  const optionsSvc = { create: vi.fn().mockResolvedValue({ id: 'opt' }) };
  const svc = new MasterPromotionService(
    masters as any,
    codeSvc as any,
    transactions as any,
    optionsSvc as any,
  );
  return { svc, tx, masters, codeSvc, transactions, optionsSvc };
}

describe('MasterPromotionService.create', () => {
  it('generates code, creates master/images through repository, and creates options inside the transaction', async () => {
    const { svc, tx, masters, codeSvc, transactions, optionsSvc } = buildService();

    const input = buildInput();
    const out = await svc.create(undefined, ORGANIZATION_ID, input);

    expect(transactions.run).toHaveBeenCalledTimes(1);
    expect(codeSvc.generate).toHaveBeenCalledWith(tx);
    expect(masters.createPromoted).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      tx,
      images: input.candidateSnapshot.sourceImages,
      data: {
        organizationId: ORGANIZATION_ID,
        code: MASTER_CODE,
        name: 'Toy',
        description: 'A toy description',
        category: 'Toys',
        brand: 'KidsCo',
        tags: ['plastic', 'kids'],
        thumbnailUrl: 'https://example.com/thumb.jpg',
        imageUrl: 'https://example.com/main.jpg',
        lifecycleState: 'active',
      },
    });
    expect(optionsSvc.create).toHaveBeenCalledTimes(2);
    expect(optionsSvc.create.mock.calls[0][1]).toEqual({
      masterId: MASTER_ID,
      optionName: 'Red',
      legacyCode: undefined,
      barcode: undefined,
      sellPrice: undefined,
      costPrice: undefined,
      sortOrder: 0,
    });
    expect(optionsSvc.create.mock.calls[1][1].legacyCode).toBe('LC-2');
    expect(optionsSvc.create.mock.calls.every((call) => call[0] === ORGANIZATION_ID && call[2] === tx)).toBe(true);
    expect(out).toEqual({ masterId: MASTER_ID, masterCode: MASTER_CODE });
  });

  it('empty options array still creates the promoted master', async () => {
    const { svc, masters, optionsSvc } = buildService();

    const result = await svc.create(undefined, ORGANIZATION_ID, buildInput({ options: [] }));

    expect(masters.createPromoted).toHaveBeenCalledTimes(1);
    expect(optionsSvc.create).not.toHaveBeenCalled();
    expect(result).toEqual({ masterId: MASTER_ID, masterCode: MASTER_CODE });
  });

  it('empty source images are passed to the repository as an empty image list', async () => {
    const { svc, masters } = buildService();

    await svc.create(undefined, ORGANIZATION_ID, buildInput({ sourceImages: [] }));

    expect(masters.createPromoted.mock.calls[0][0].images).toEqual([]);
  });

  it('outerTx passed: reuses it instead of opening a new repository transaction', async () => {
    const { svc, masters, codeSvc, transactions, optionsSvc } = buildService();
    const outerTx = { outer: true };

    const result = await svc.create(outerTx as any, ORGANIZATION_ID, buildInput());

    expect(transactions.run).not.toHaveBeenCalled();
    expect(codeSvc.generate).toHaveBeenCalledWith(outerTx);
    expect(masters.createPromoted.mock.calls[0][0].tx).toBe(outerTx);
    expect(optionsSvc.create.mock.calls.every((call) => call[2] === outerTx)).toBe(true);
    expect(result).toEqual({ masterId: MASTER_ID, masterCode: MASTER_CODE });
  });
});

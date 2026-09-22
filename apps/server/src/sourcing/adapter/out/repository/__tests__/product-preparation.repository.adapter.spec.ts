import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../../prisma/prisma.service';
import { ProductPreparationRepositoryAdapter } from '../../../../../channels/adapter/out/persistence/candidate-registration.repository.adapter';

const UPDATED_AT = new Date('2026-07-13T01:02:03.000Z');

function currentPreparation() {
  return {
    id: 'preparation-1',
    organizationId: 'organization-1',
    salesProductId: 'sales-product-1',
    sourceCandidateId: 'candidate-1',
    channelAccountId: 'account-1',
    sourceContentWorkspaceId: 'workspace-1',
    closedAt: null,
    displayName: '기존 상품명',
    reviewPayloadHash: null,
    registrationInput: {
      name: '기존 상품명',
      optionNames: ['단품', '2개 세트'],
      channels: {
        coupang: {
          sellerProductName: '쿠팡 전용 상품명',
          notices: ['age'],
          salePrice: 21900,
        },
        rocket: { sku: 'ROCKET-1' },
      },
    },
    selectedThumbnailUrl: null,
    selectedThumbnailGenerationId: null,
    selectedThumbnailGenerationCandidateId: null,
    selectedDetailPageArtifactId: null,
    selectedDetailPageRevisionId: null,
    selectedDetailPageGenerationId: null,
    isDeleted: false,
    deletedAt: null,
    createdByUserId: 'user-1',
    createdAt: new Date('2026-07-13T00:00:00.000Z'),
    updatedAt: UPDATED_AT,
  };
}

function setup(existingExecution: {
  status: string;
  providerSubmissionId: string | null;
  externalListingId: string | null;
  resultJson: unknown;
} | null = null) {
  const current = currentPreparation();
  const update = vi.fn().mockImplementation(async ({ data }) => {
    Object.assign(current, data);
    return current;
  });
  const executionRows = existingExecution
    ? [{
      id: 'execution-1',
      productPreparationId: current.id,
      channelAccountId: current.channelAccountId,
      channelListingId: null,
      executionKind: 'external_wing',
      createdAt: new Date('2026-07-13T00:30:00.000Z'),
      providerOutcome: 'not_attempted',
      submissionPayloadJson: { frozen: 'payload' },
      submissionPayloadHash: 'b'.repeat(64),
      ...existingExecution,
    }]
    : [];
  const findFirst = vi.fn()
    .mockResolvedValueOnce({ sourceCandidateId: current.sourceCandidateId })
    .mockResolvedValueOnce(current);
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    productPreparation: { findFirst, update },
    // 실행 장부는 Channels 리더로만 읽는다(ADR-0009). 리더가 실제로 부르는
    // findMany 를 그대로 흉내 내야 경계가 바뀌면 이 테스트가 먼저 깨진다.
    productRegistrationExecution: {
      findMany: vi.fn().mockResolvedValue(executionRows),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    sourcingCandidate: {
      findFirst: vi.fn().mockResolvedValue({ id: current.sourceCandidateId }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) =>
      operation(tx)),
  };
  const source = {
    lock: vi.fn().mockResolvedValue(undefined),
    requireActive: vi.fn().mockResolvedValue(undefined),
  };
  const repository = new ProductPreparationRepositoryAdapter(
    prisma as unknown as PrismaService,
    source,
  );
  const resolveSelections = vi.fn(async (_transaction, input) => ({
    selectedThumbnailUrl: input.selectedThumbnailUrl,
    selectedThumbnailGenerationId: input.selectedThumbnailGenerationId,
    selectedThumbnailGenerationCandidateId: input.selectedThumbnailGenerationCandidateId,
    selectedDetailPageArtifactId: input.selectedDetailPageArtifactId,
    selectedDetailPageRevisionId: input.selectedDetailPageRevisionId,
    selectedDetailPageGenerationId: input.selectedDetailPageGenerationId,
  }));
  return { current, repository, resolveSelections, update, executionRows, tx };
}

describe('ProductPreparationRepositoryAdapter draft patches', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves nested channel metadata while replacing patched arrays and scalar fields', async () => {
    const { current, repository, resolveSelections, update } = setup();

    await repository.replaceDraftInput({
      organizationId: 'organization-1',
      preparationId: 'preparation-1',
      userId: 'user-1',
      command: {
        kind: 'replace',
        input: {
          basePreparationUpdatedAt: UPDATED_AT.toISOString(),
          registrationInput: {
            name: '수정 상품명',
            optionNames: ['3개 세트'],
            channels: { coupang: { salePrice: 23900 } },
          },
        },
      },
    }, resolveSelections);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'organization-1' }),
      data: expect.objectContaining({
        registrationInput: {
          name: '수정 상품명',
          optionNames: ['3개 세트'],
          channels: {
            coupang: {
              sellerProductName: '쿠팡 전용 상품명',
              notices: ['age'],
              salePrice: 23900,
            },
            rocket: { sku: 'ROCKET-1' },
          },
        },
      }),
    }));
    expect(current.registrationInput).toEqual(expect.objectContaining({
      channels: expect.objectContaining({ rocket: { sku: 'ROCKET-1' } }),
    }));
  });

  it('leaves registration input untouched for a thumbnail-only patch', async () => {
    const { current, repository, resolveSelections, update } = setup();
    const originalRegistrationInput = structuredClone(current.registrationInput);

    await repository.replaceDraftInput({
      organizationId: 'organization-1',
      preparationId: 'preparation-1',
      userId: 'user-1',
      command: {
        kind: 'replace',
        input: {
          basePreparationUpdatedAt: UPDATED_AT.toISOString(),
          selectedThumbnailUrl: 'https://cdn.example.com/selected.jpg',
        },
      },
    }, resolveSelections);

    const persistedUpdate = update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(persistedUpdate).not.toHaveProperty('registrationInput');
    expect(current.registrationInput).toEqual(originalRegistrationInput);
  });

  it('allows a draft patch while preserving an active execution snapshot', async () => {
    const { current, repository, resolveSelections, update, executionRows, tx } = setup({
      status: 'prepared',
      providerSubmissionId: null,
      externalListingId: null,
      resultJson: null,
    });
    const frozenExecution = structuredClone(executionRows);

    await expect(repository.replaceDraftInput({
      organizationId: 'organization-1',
      preparationId: 'preparation-1',
      userId: 'user-1',
      command: {
        kind: 'replace',
        input: { displayName: 'Unsafe replacement' },
      },
    }, resolveSelections)).resolves.toEqual({ preparationId: 'preparation-1', status: 'draft' });

    expect(current.displayName).toBe('Unsafe replacement');
    expect(resolveSelections).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(tx.productRegistrationExecution.create).not.toHaveBeenCalled();
    expect(tx.productRegistrationExecution.update).not.toHaveBeenCalled();
    expect(tx.productRegistrationExecution.updateMany).not.toHaveBeenCalled();
    expect(tx.productRegistrationExecution.delete).not.toHaveBeenCalled();
    expect(tx.productRegistrationExecution.deleteMany).not.toHaveBeenCalled();
    expect(executionRows).toEqual(frozenExecution);
  });

  it('still rejects cancellation while an execution outcome is unresolved', async () => {
    const { repository, resolveSelections, update } = setup({
      status: 'reconciling',
      providerSubmissionId: null,
      externalListingId: null,
      resultJson: null,
    });

    await expect(repository.replaceDraftInput({
      organizationId: 'organization-1',
      preparationId: 'preparation-1',
      userId: 'user-1',
      command: { kind: 'cancel' },
    }, resolveSelections)).rejects.toThrow(
      'An active execution must be resolved before archiving its target.',
    );

    expect(resolveSelections).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a stale patch before resolving selections or mutating the draft', async () => {
    const { repository, resolveSelections, update } = setup();

    await expect(repository.replaceDraftInput({
      organizationId: 'organization-1',
      preparationId: 'preparation-1',
      userId: 'user-1',
      command: {
        kind: 'replace',
        input: {
          basePreparationUpdatedAt: '2026-07-13T01:00:00.000Z',
          registrationInput: { name: '오래된 탭 상품명' },
        },
      },
    }, resolveSelections)).rejects.toBeInstanceOf(ConflictException);

    expect(resolveSelections).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

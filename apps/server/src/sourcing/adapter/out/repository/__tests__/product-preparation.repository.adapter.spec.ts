import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../../prisma/prisma.service';
import { ProductPreparationRepositoryAdapter } from '../product-preparation.repository.adapter';

const UPDATED_AT = new Date('2026-07-13T01:02:03.000Z');

function currentPreparation() {
  return {
    id: 'preparation-1',
    organizationId: 'organization-1',
    sourceCandidateId: 'candidate-1',
    channelAccountId: 'account-1',
    sourceContentWorkspaceId: 'workspace-1',
    channelListingId: null,
    displayName: '기존 상품명',
    status: 'draft',
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
    providerOutcome: 'not_attempted',
    providerSubmissionId: null,
    registrationResult: null,
    submissionKey: 'submission-key-1',
    submissionPayloadJson: null,
    submissionPayloadHash: null,
    submissionLeaseToken: null,
    submissionLeaseClaimedAt: null,
    lastError: null,
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
  const updateMany = vi.fn().mockImplementation(async ({ data }) => {
    Object.assign(current, data);
    return { count: 1 };
  });
  const findFirst = vi.fn()
    .mockResolvedValueOnce({ sourceCandidateId: current.sourceCandidateId })
    .mockResolvedValueOnce(current);
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    productPreparation: { findFirst, updateMany },
    productRegistrationExecution: {
      findFirst: vi.fn().mockResolvedValue(existingExecution),
    },
    sourcingCandidate: {
      findFirst: vi.fn().mockResolvedValue({ id: current.sourceCandidateId }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) =>
      operation(tx)),
  };
  const repository = new ProductPreparationRepositoryAdapter(
    prisma as unknown as PrismaService,
  );
  const resolveSelections = vi.fn(async (_transaction, input) => ({
    selectedThumbnailUrl: input.selectedThumbnailUrl,
    selectedThumbnailGenerationId: input.selectedThumbnailGenerationId,
    selectedThumbnailGenerationCandidateId: input.selectedThumbnailGenerationCandidateId,
    selectedDetailPageArtifactId: input.selectedDetailPageArtifactId,
    selectedDetailPageRevisionId: input.selectedDetailPageRevisionId,
    selectedDetailPageGenerationId: input.selectedDetailPageGenerationId,
  }));
  return { current, repository, resolveSelections, updateMany };
}

describe('ProductPreparationRepositoryAdapter draft patches', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves nested channel metadata while replacing patched arrays and scalar fields', async () => {
    const { current, repository, resolveSelections, updateMany } = setup();

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

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
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
    const { current, repository, resolveSelections, updateMany } = setup();
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

    const update = updateMany.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(update).not.toHaveProperty('registrationInput');
    expect(current.registrationInput).toEqual(originalRegistrationInput);
  });

  it('rejects a patch while an active registration execution owns the draft', async () => {
    const { repository, resolveSelections, updateMany } = setup({
      status: 'prepared',
      providerSubmissionId: null,
      externalListingId: null,
      resultJson: null,
    });

    await expect(repository.replaceDraftInput({
      organizationId: 'organization-1',
      preparationId: 'preparation-1',
      userId: 'user-1',
      command: {
        kind: 'replace',
        input: {
          basePreparationUpdatedAt: UPDATED_AT.toISOString(),
          registrationInput: { name: '실행 중 수정' },
        },
      },
    }, resolveSelections)).rejects.toThrow(
      'Preparation execution cannot be discarded or edited.',
    );

    expect(resolveSelections).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects a stale patch before resolving selections or mutating the draft', async () => {
    const { repository, resolveSelections, updateMany } = setup();

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
    expect(updateMany).not.toHaveBeenCalled();
  });
});

import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  SOURCING_CANDIDATE_REPOSITORY_PORT,
  type CandidateForPreparationRow,
  type SourcingCandidateRepositoryPort,
} from '../port/out/repository/sourcing-candidate.repository.port';
import type { SourcingRepositoryTransaction } from '../port/out/transaction/repository-transaction';

export interface UpdateProductBasicsInput {
  name?: string;
  category?: string;
  description?: string;
  target?: string;
  ageGroup?: string;
  tags?: string[];
  keywords?: string[];
  optionNames?: string[];
  kcCertificationStatus?: string;
  kcCertificationNumber?: string;
  kcCertificationImageUrl?: string;
  productSize?: string;
  colorVariantStatus?: string;
  colorVariantNames?: string;
  boxSetStatus?: string;
  boxSetQuantity?: string;
  salePrice?: number;
  originalPrice?: number;
  discountRate?: number;
  rocketBundleQuantity?: number;
  rocketUnitCost?: number;
  thumbnailUrls?: string[];
  /**
   * Client-observed ProductPreparation.updatedAt. Null means the screen opened
   * before a preparation row existed; undefined keeps legacy callers unlocked.
   */
  basePreparationUpdatedAt?: string | null;
}

@Injectable()
export class ProductPreparationSelectionService {
  constructor(
    @Inject(SOURCING_CANDIDATE_REPOSITORY_PORT)
    private readonly candidates: SourcingCandidateRepositoryPort,
  ) {}

  async ensureRegistrationInputFromCandidate(
    organizationId: string,
    candidateId: string,
  ) {
    return this.withLockedCandidate(organizationId, candidateId, async (tx, candidate) => {
      const existing = await this.candidates.findActivePreparation(tx, {
        organizationId,
        sourceCandidateId: candidate.id,
      });
      if (existing) {
        return existing;
      }
      return this.candidates.upsertPreparation(tx, {
        organizationId,
        candidate,
        data: {},
      });
    });
  }

  async updateBasics(
    organizationId: string,
    candidateId: string,
    input: UpdateProductBasicsInput,
  ) {
    return this.withLockedCandidate(organizationId, candidateId, async (tx, candidate) => {
      const existing = await this.candidates.findActivePreparation(tx, {
        organizationId,
        sourceCandidateId: candidate.id,
      });
      if (Object.prototype.hasOwnProperty.call(input, 'basePreparationUpdatedAt')) {
        this.assertPreparationFresh(existing, input.basePreparationUpdatedAt ?? null);
      }
      const registrationInput = this.mergeRegistrationInput(
        this.registrationInputFromCandidate(candidate),
        jsonRecord(existing?.registrationInput),
        input,
      );

      return this.upsertPreparation(tx, organizationId, candidate, {
        displayName: stringOr(registrationInput.name) ?? candidate.name,
        registrationInput,
      });
    });
  }

  async selectThumbnail(
    organizationId: string,
    candidateId: string,
    input: {
      selectedThumbnailUrl: string;
      selectedThumbnailGenerationCandidateId?: string | null;
    },
  ) {
    const thumbnailUrl = input.selectedThumbnailUrl.trim();
    if (!/^https?:\/\//.test(thumbnailUrl) && !thumbnailUrl.startsWith('data:image/')) {
      throw new BadRequestException('등록 대표 썸네일 URL을 확인하세요.');
    }

    return this.withLockedCandidate(organizationId, candidateId, async (tx, candidate) => {
      const selectedThumbnail = input.selectedThumbnailGenerationCandidateId
        ? await this.resolveThumbnailCandidate(tx, organizationId, candidate, {
            url: thumbnailUrl,
            generatedCandidateId: input.selectedThumbnailGenerationCandidateId,
          })
        : null;

      return this.upsertPreparation(tx, organizationId, candidate, {
        contentWorkspaceId: selectedThumbnail?.contentWorkspaceId ?? undefined,
        selectedThumbnailUrl: thumbnailUrl,
        selectedThumbnailGenerationId: selectedThumbnail?.generationId ?? null,
        selectedThumbnailGenerationCandidateId: selectedThumbnail?.id ?? null,
      });
    });
  }

  async selectDetailPage(
    organizationId: string,
    candidateId: string,
    input: {
      selectedDetailPageGenerationId: string;
      selectedDetailPageArtifactId?: string | null;
      selectedDetailPageRevisionId?: string | null;
    },
  ) {
    return this.withLockedCandidate(organizationId, candidateId, async (tx, candidate) => {
      const detailPage = await this.resolveDetailPageGeneration(
        tx,
        organizationId,
        candidate,
        input,
      );
      return this.upsertPreparation(tx, organizationId, candidate, {
        contentWorkspaceId: detailPage.contentWorkspaceId ?? undefined,
        selectedDetailPageGenerationId: detailPage.id,
        selectedDetailPageArtifactId: detailPage.artifactId,
        selectedDetailPageRevisionId: detailPage.revisionId,
      });
    });
  }

  private async findCandidate(
    tx: SourcingRepositoryTransaction,
    organizationId: string,
    candidateId: string,
  ): Promise<CandidateForPreparationRow> {
    const candidate = await this.candidates.findCandidateForPreparation(tx, {
      organizationId,
      candidateId,
    });
    if (!candidate) throw new NotFoundException('상품을 찾을 수 없습니다.');
    return candidate;
  }

  private async resolveThumbnailCandidate(
    tx: SourcingRepositoryTransaction,
    organizationId: string,
    candidate: CandidateForPreparationRow,
    input: { url: string; generatedCandidateId: string },
  ) {
    const generated = await this.candidates.findPreparationThumbnailCandidate(tx, {
      organizationId,
      candidate,
      generatedCandidateId: input.generatedCandidateId,
    });
    if (!generated) {
      throw new BadRequestException('선택한 썸네일 생성 결과가 이 상품에 속하지 않습니다.');
    }
    if (generated.url !== input.url) {
      throw new BadRequestException('선택한 썸네일 URL과 생성 결과가 일치하지 않습니다.');
    }
    return {
      id: generated.id,
      generationId: generated.generationId,
      contentWorkspaceId: generated.contentWorkspaceId,
    };
  }

  private async resolveDetailPageGeneration(
    tx: SourcingRepositoryTransaction,
    organizationId: string,
    candidate: CandidateForPreparationRow,
    input: {
      selectedDetailPageGenerationId: string;
      selectedDetailPageArtifactId?: string | null;
      selectedDetailPageRevisionId?: string | null;
    },
  ) {
    const generation = await this.candidates.findPreparationDetailPageGeneration(tx, {
      organizationId,
      candidate,
      contentGenerationId: input.selectedDetailPageGenerationId,
    });
    if (!generation) {
      throw new BadRequestException('선택한 상세페이지가 이 상품에 속하지 않습니다.');
    }
    const artifactId = generation.artifactId;
    if (!artifactId) throw new BadRequestException('선택한 상세페이지 아티팩트가 아직 준비되지 않았습니다.');
    if (input.selectedDetailPageArtifactId && input.selectedDetailPageArtifactId !== artifactId) {
      throw new BadRequestException('선택한 상세페이지 아티팩트가 생성 결과와 일치하지 않습니다.');
    }
    const revisionId = input.selectedDetailPageRevisionId ?? generation.revisionId ?? null;
    if (input.selectedDetailPageRevisionId) {
      const revision = await this.candidates.findPreparationDetailPageRevision(tx, {
        organizationId,
        artifactId,
        revisionId: input.selectedDetailPageRevisionId,
      });
      if (!revision) {
        throw new BadRequestException('선택한 상세페이지 버전이 이 상품에 속하지 않습니다.');
      }
    }
    return {
      id: generation.id,
      contentWorkspaceId: generation.contentWorkspaceId,
      artifactId,
      revisionId,
    };
  }

  private async upsertPreparation(
    tx: SourcingRepositoryTransaction,
    organizationId: string,
    candidate: CandidateForPreparationRow,
    data: Record<string, unknown>,
  ) {
    return this.candidates.upsertPreparation(tx, {
      organizationId,
      candidate,
      data,
    });
  }

  private withLockedCandidate<T>(
    organizationId: string,
    candidateId: string,
    operation: (
      tx: SourcingRepositoryTransaction,
      candidate: CandidateForPreparationRow,
    ) => Promise<T>,
  ): Promise<T> {
    return this.candidates.runInTransaction(async (tx) => {
      await this.candidates.lockCandidate(tx, {
        id: candidateId,
        organizationId,
      });
      const candidate = await this.findCandidate(tx, organizationId, candidateId);
      return operation(tx, candidate);
    });
  }

  private registrationInputFromCandidate(candidate: CandidateForPreparationRow): Record<string, unknown> {
    const raw = candidate.rawData && typeof candidate.rawData === 'object' && !Array.isArray(candidate.rawData)
      ? candidate.rawData as Record<string, unknown>
      : {};
    return {
      ...raw,
      name: stringOr(raw.name ?? raw.title) ?? candidate.name,
      category: stringOr(raw.category) ?? candidate.category ?? '',
      description: stringOr(raw.description) ?? candidate.description ?? '',
      target: stringOr(raw.target) ?? '',
      ageGroup: stringOr(raw.ageGroup) ?? '',
      kcCertificationStatus: stringOr(raw.kcCertificationStatus) ?? '',
      kcCertificationNumber: stringOr(raw.kcCertificationNumber) ?? '',
      kcCertificationImageUrl: stringOr(raw.kcCertificationImageUrl) ?? '',
      productSize: stringOr(raw.productSize) ?? '',
      colorVariantStatus: stringOr(raw.colorVariantStatus) ?? '',
      colorVariantNames: stringOr(raw.colorVariantNames) ?? '',
      boxSetStatus: stringOr(raw.boxSetStatus) ?? '',
      boxSetQuantity: stringOr(raw.boxSetQuantity) ?? '',
      salePrice: numberOr(raw.salePrice),
      originalPrice: numberOr(raw.originalPrice),
      discountRate: numberOr(raw.discountRate),
      rocketBundleQuantity: numberOr(raw.rocketBundleQuantity),
      rocketUnitCost: numberOr(raw.rocketUnitCost),
      tags: Array.isArray(candidate.tags) ? candidate.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    };
  }

  private mergeRegistrationInput(
    base: Record<string, unknown>,
    current: Record<string, unknown>,
    input: UpdateProductBasicsInput,
  ): Record<string, unknown> {
    const next: Record<string, unknown> = { ...base, ...current };
    setString(next, 'name', input.name);
    setString(next, 'category', input.category);
    setString(next, 'description', input.description);
    setString(next, 'target', input.target);
    setString(next, 'ageGroup', input.ageGroup);
    setString(next, 'kcCertificationStatus', input.kcCertificationStatus);
    setString(next, 'kcCertificationNumber', input.kcCertificationNumber);
    setString(next, 'kcCertificationImageUrl', input.kcCertificationImageUrl);
    setString(next, 'productSize', input.productSize);
    setString(next, 'colorVariantStatus', input.colorVariantStatus);
    setString(next, 'colorVariantNames', input.colorVariantNames);
    setString(next, 'boxSetStatus', input.boxSetStatus);
    setString(next, 'boxSetQuantity', input.boxSetQuantity);
    setNumber(next, 'salePrice', input.salePrice);
    setNumber(next, 'originalPrice', input.originalPrice);
    setNumber(next, 'discountRate', input.discountRate);
    setNumber(next, 'rocketBundleQuantity', input.rocketBundleQuantity);
    setNumber(next, 'rocketUnitCost', input.rocketUnitCost);
    setStringArray(next, 'tags', input.tags);
    setStringArray(next, 'keywords', input.keywords);
    setStringArray(next, 'optionNames', input.optionNames);
    setStringArray(next, 'thumbnailUrls', input.thumbnailUrls);
    return next;
  }

  private assertPreparationFresh(
    existing: { updatedAt: Date } | null,
    basePreparationUpdatedAt: string | null,
  ): void {
    if (!basePreparationUpdatedAt) {
      if (existing) throw stalePreparationConflict();
      return;
    }

    const parsed = Date.parse(basePreparationUpdatedAt);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException('basePreparationUpdatedAt must be an ISO date string');
    }

    if (!existing || existing.updatedAt.getTime() !== parsed) {
      throw stalePreparationConflict();
    }
  }
}

function stalePreparationConflict(): ConflictException {
  return new ConflictException('상품 기본정보가 다른 탭에서 먼저 변경되었습니다. 새로고침 후 다시 저장해주세요.');
}

function stringOr(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberOr(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function setString(target: Record<string, unknown>, key: string, value: string | undefined) {
  if (value === undefined) return;
  target[key] = value.trim();
}

function setStringArray(target: Record<string, unknown>, key: string, value: string[] | undefined) {
  if (value === undefined) return;
  target[key] = value.map((item) => item.trim()).filter(Boolean);
}

function setNumber(target: Record<string, unknown>, key: string, value: number | undefined) {
  if (value === undefined) return;
  target[key] = Number.isFinite(value) && value >= 0 ? value : 0;
}

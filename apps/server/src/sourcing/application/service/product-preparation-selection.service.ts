import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

type CandidateForPreparation = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: Prisma.JsonValue;
  rawData: Prisma.JsonValue;
  promotedMasterId: string | null;
};

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
  productSize?: string;
  colorVariantStatus?: string;
  colorVariantNames?: string;
  boxSetStatus?: string;
  boxSetQuantity?: string;
  salePrice?: number;
  originalPrice?: number;
  discountRate?: number;
}

@Injectable()
export class ProductPreparationSelectionService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureRegistrationInputFromCandidate(
    organizationId: string,
    candidateId: string,
  ) {
    const candidate = await this.findCandidate(organizationId, candidateId);
    const existing = await this.prisma.productPreparation.findFirst({
      where: { organizationId, sourceCandidateId: candidate.id, isDeleted: false },
      select: { id: true, registrationInput: true },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.productPreparation.create({
      data: this.createDataFromCandidate(organizationId, candidate, {}),
    });
  }

  async updateBasics(
    organizationId: string,
    candidateId: string,
    input: UpdateProductBasicsInput,
  ) {
    const candidate = await this.findCandidate(organizationId, candidateId);
    const existing = await this.prisma.productPreparation.findFirst({
      where: { organizationId, sourceCandidateId: candidate.id, isDeleted: false },
      select: { id: true, registrationInput: true },
    });
    const registrationInput = this.mergeRegistrationInput(
      this.registrationInputFromCandidate(candidate),
      jsonRecord(existing?.registrationInput),
      input,
    );

    return this.upsertPreparation(organizationId, candidate, {
      displayName: stringOr(registrationInput.name) ?? candidate.name,
      registrationInput,
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

    const candidate = await this.findCandidate(organizationId, candidateId);
    const selectedThumbnail = input.selectedThumbnailGenerationCandidateId
      ? await this.resolveThumbnailCandidate(organizationId, candidate, {
          url: thumbnailUrl,
          generatedCandidateId: input.selectedThumbnailGenerationCandidateId,
        })
      : null;

    return this.upsertPreparation(organizationId, candidate, {
      contentWorkspaceId: selectedThumbnail?.contentWorkspaceId ?? undefined,
      selectedThumbnailUrl: thumbnailUrl,
      selectedThumbnailGenerationId: selectedThumbnail?.generationId ?? null,
      selectedThumbnailGenerationCandidateId: selectedThumbnail?.id ?? null,
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
    const candidate = await this.findCandidate(organizationId, candidateId);
    const detailPage = await this.resolveDetailPageGeneration(organizationId, candidate, input);
    return this.upsertPreparation(organizationId, candidate, {
      contentWorkspaceId: detailPage.contentWorkspaceId ?? undefined,
      selectedDetailPageGenerationId: detailPage.id,
      selectedDetailPageArtifactId: detailPage.artifactId,
      selectedDetailPageRevisionId: detailPage.revisionId,
    });
  }

  private async findCandidate(
    organizationId: string,
    candidateId: string,
  ): Promise<CandidateForPreparation> {
    const candidate = await this.prisma.sourcingCandidate.findFirst({
      where: { id: candidateId, organizationId, isDeleted: false },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        tags: true,
        rawData: true,
        promotedMasterId: true,
      },
    });
    if (!candidate) throw new NotFoundException('상품을 찾을 수 없습니다.');
    return candidate;
  }

  private async resolveThumbnailCandidate(
    organizationId: string,
    candidate: CandidateForPreparation,
    input: { url: string; generatedCandidateId: string },
  ) {
    const generated = await this.prisma.thumbnailGenerationCandidate.findFirst({
      where: {
        id: input.generatedCandidateId,
        organizationId,
        generation: {
          organizationId,
          isDeleted: false,
          OR: [
            { sourceCandidateId: candidate.id },
            ...(candidate.promotedMasterId ? [{ masterId: candidate.promotedMasterId }] : []),
          ],
        },
      },
      select: {
        id: true,
        url: true,
        generationId: true,
        generation: {
          select: {
            contentWorkspaceId: true,
          },
        },
      },
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
      contentWorkspaceId: generated.generation.contentWorkspaceId,
    };
  }

  private async resolveDetailPageGeneration(
    organizationId: string,
    candidate: CandidateForPreparation,
    input: {
      selectedDetailPageGenerationId: string;
      selectedDetailPageArtifactId?: string | null;
      selectedDetailPageRevisionId?: string | null;
    },
  ) {
    const generation = await this.prisma.contentGeneration.findFirst({
      where: {
        id: input.selectedDetailPageGenerationId,
        organizationId,
        isDeleted: false,
        contentType: 'detail_page',
        OR: [
          { sourceCandidateId: candidate.id },
          ...(candidate.promotedMasterId
            ? [{ generationGroup: { is: { targetMasterId: candidate.promotedMasterId } } }]
            : []),
        ],
      },
      select: {
        id: true,
        contentWorkspaceId: true,
        detailPageArtifactId: true,
        detailPageArtifact: {
          select: {
            currentRevisionId: true,
          },
        },
      },
    });
    if (!generation) {
      throw new BadRequestException('선택한 상세페이지가 이 상품에 속하지 않습니다.');
    }
    const artifactId = generation.detailPageArtifactId;
    if (!artifactId) throw new BadRequestException('선택한 상세페이지 아티팩트가 아직 준비되지 않았습니다.');
    if (input.selectedDetailPageArtifactId && input.selectedDetailPageArtifactId !== artifactId) {
      throw new BadRequestException('선택한 상세페이지 아티팩트가 생성 결과와 일치하지 않습니다.');
    }
    const revisionId = input.selectedDetailPageRevisionId ?? generation.detailPageArtifact?.currentRevisionId ?? null;
    if (input.selectedDetailPageRevisionId) {
      const revision = await this.prisma.detailPageRevision.findFirst({
        where: {
          id: input.selectedDetailPageRevisionId,
          organizationId,
          artifactId,
        },
        select: { id: true },
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
    organizationId: string,
    candidate: CandidateForPreparation,
    data: Prisma.ProductPreparationUncheckedUpdateInput,
  ) {
    const existing = await this.prisma.productPreparation.findFirst({
      where: { organizationId, sourceCandidateId: candidate.id, isDeleted: false },
      select: { id: true },
    });
    if (existing) {
      return this.prisma.productPreparation.update({
        where: { id: existing.id },
        data,
      });
    }
    return this.prisma.productPreparation.create({
      data: this.createDataFromCandidate(organizationId, candidate, data),
    });
  }

  private createDataFromCandidate(
    organizationId: string,
    candidate: CandidateForPreparation,
    data: Prisma.ProductPreparationUncheckedUpdateInput,
  ): Prisma.ProductPreparationUncheckedCreateInput {
    return {
      organizationId,
      sourceCandidateId: candidate.id,
      masterId: candidate.promotedMasterId,
      displayName: candidate.name,
      status: candidate.promotedMasterId ? 'product_registered' : 'draft',
      registrationInput: this.registrationInputFromCandidate(candidate),
      ...data,
    } as Prisma.ProductPreparationUncheckedCreateInput;
  }

  private registrationInputFromCandidate(candidate: CandidateForPreparation): Prisma.InputJsonObject {
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
      productSize: stringOr(raw.productSize) ?? '',
      colorVariantStatus: stringOr(raw.colorVariantStatus) ?? '',
      colorVariantNames: stringOr(raw.colorVariantNames) ?? '',
      boxSetStatus: stringOr(raw.boxSetStatus) ?? '',
      boxSetQuantity: stringOr(raw.boxSetQuantity) ?? '',
      salePrice: numberOr(raw.salePrice),
      originalPrice: numberOr(raw.originalPrice),
      discountRate: numberOr(raw.discountRate),
      tags: Array.isArray(candidate.tags) ? candidate.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    };
  }

  private mergeRegistrationInput(
    base: Prisma.InputJsonObject,
    current: Record<string, unknown>,
    input: UpdateProductBasicsInput,
  ): Prisma.InputJsonObject {
    const next: Record<string, unknown> = { ...base, ...current };
    setString(next, 'name', input.name);
    setString(next, 'category', input.category);
    setString(next, 'description', input.description);
    setString(next, 'target', input.target);
    setString(next, 'ageGroup', input.ageGroup);
    setString(next, 'kcCertificationStatus', input.kcCertificationStatus);
    setString(next, 'kcCertificationNumber', input.kcCertificationNumber);
    setString(next, 'productSize', input.productSize);
    setString(next, 'colorVariantStatus', input.colorVariantStatus);
    setString(next, 'colorVariantNames', input.colorVariantNames);
    setString(next, 'boxSetStatus', input.boxSetStatus);
    setString(next, 'boxSetQuantity', input.boxSetQuantity);
    setNumber(next, 'salePrice', input.salePrice);
    setNumber(next, 'originalPrice', input.originalPrice);
    setNumber(next, 'discountRate', input.discountRate);
    setStringArray(next, 'tags', input.tags);
    setStringArray(next, 'keywords', input.keywords);
    setStringArray(next, 'optionNames', input.optionNames);
    return next as Prisma.InputJsonObject;
  }
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

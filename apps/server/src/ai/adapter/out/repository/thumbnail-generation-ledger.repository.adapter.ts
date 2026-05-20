import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SaveEditorResultInput,
  ThumbnailGenerationLedgerRepositoryPort,
  ThumbnailGenerationLedgerRow,
  ThumbnailGenerationParentAlertLink,
} from '../../../application/port/out/repository/thumbnail-generation-ledger.repository.port';
import { readProductGenerationAlertLink } from '../../../application/service/product-generation-alert-link';
import {
  findActiveJobForProduct,
  findAutoBatchCandidates,
  findGenerationMaster,
  findGenerationMasters,
  findGenerationOrThrow,
  findGenerationRows,
  findGenerationWithCandidatesOrThrow,
  findGenerationWithInputImages,
  findJobMaster,
  findJobMastersByIds,
  findProductForEditor,
  findRecentAutoJob,
  findThumbnailAnalysisGrade,
} from './thumbnail-generation-ledger.query';
import {
  applyDirectSuccessResult,
  applyGenerationToMaster,
  clearReadySelections,
  createPendingCandidateJob,
  createPendingEditJob,
  createPendingStandaloneJob,
  deleteGeneration,
  lockGenerationForProcessing,
  markGenerationCancelled,
  markGenerationFailed,
  persistPendingInputImages,
  removeCandidate,
  replaceGenerationResult,
  resetGenerationForReEdit,
  saveEditorResult,
  setSelectedCandidate,
} from './thumbnail-generation-ledger.persistence';

@Injectable()
export class ThumbnailGenerationLedgerRepositoryAdapter
  implements ThumbnailGenerationLedgerRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  findProductForEditor(productId: string, organizationId: string) {
    return findProductForEditor(this.prisma, productId, organizationId);
  }

  async findGenerationRows(
    organizationId: string,
    opts: Parameters<ThumbnailGenerationLedgerRepositoryPort['findGenerationRows']>[1] = {},
  ) {
    return findGenerationRows(this.prisma, organizationId, opts);
  }

  async findGenerationOrThrow(id: string, organizationId: string) {
    return findGenerationOrThrow(this.prisma, id, organizationId);
  }

  async findGenerationWithCandidatesOrThrow(id: string, organizationId: string) {
    return findGenerationWithCandidatesOrThrow(this.prisma, id, organizationId) as Promise<
      Awaited<ReturnType<ThumbnailGenerationLedgerRepositoryPort['findGenerationWithCandidatesOrThrow']>>
    >;
  }

  async findGenerationWithInputImages(id: string, organizationId: string) {
    return findGenerationWithInputImages(this.prisma, id, organizationId) as Promise<
      Awaited<ReturnType<ThumbnailGenerationLedgerRepositoryPort['findGenerationWithInputImages']>>
    >;
  }

  async findGenerationMasters(
    rows: Array<{ masterId: string | null }>,
    organizationId: string,
  ) {
    return findGenerationMasters(this.prisma, rows, organizationId);
  }

  findGenerationMaster(masterId: string | null, organizationId: string) {
    return findGenerationMaster(this.prisma, masterId, organizationId);
  }

  async findJobMaster(masterId: string, organizationId: string) {
    return findJobMaster(this.prisma, masterId, organizationId) as Promise<
      Awaited<ReturnType<ThumbnailGenerationLedgerRepositoryPort['findJobMaster']>>
    >;
  }

  async findSourceCandidateForJob(sourceCandidateId: string, organizationId: string) {
    return this.prisma.sourcingCandidate.findFirst({
      where: {
        id: sourceCandidateId,
        organizationId,
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        category: true,
        images: {
          where: { isDeleted: false },
          select: { id: true, url: true, storageKey: true },
        },
      },
    });
  }

  async findJobMastersByIds(ids: string[], organizationId: string) {
    return findJobMastersByIds(this.prisma, ids, organizationId) as Promise<
      Awaited<ReturnType<ThumbnailGenerationLedgerRepositoryPort['findJobMastersByIds']>>
    >;
  }

  async findActiveJobForProduct(
    masterId: string,
    organizationId: string,
    method: string,
  ) {
    return findActiveJobForProduct(this.prisma, masterId, organizationId, method);
  }

  findRecentAutoJob(masterId: string, organizationId: string, cooldownStart: Date) {
    return findRecentAutoJob(this.prisma, masterId, organizationId, cooldownStart);
  }

  findAutoBatchCandidates(organizationId: string, take: number) {
    return findAutoBatchCandidates(this.prisma, organizationId, take);
  }

  findThumbnailAnalysisGrade(masterId: string, organizationId: string) {
    return findThumbnailAnalysisGrade(this.prisma, masterId, organizationId);
  }

  saveEditorResult(input: SaveEditorResultInput) {
    return saveEditorResult(this.prisma, {
      ...input,
      inputMeta: input.inputMeta as Prisma.InputJsonValue | null | undefined,
    });
  }

  async openPendingEditorJob(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['openPendingEditorJob']>[0],
  ) {
    return createPendingEditJob(this.prisma, {
      ...input,
      inputMeta: input.inputMeta as Prisma.InputJsonValue,
    });
  }

  openPendingCandidateJob(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['openPendingCandidateJob']>[0],
  ) {
    return createPendingCandidateJob(this.prisma, {
      ...input,
      inputMeta: input.inputMeta as Prisma.InputJsonValue,
    });
  }

  openPendingStandaloneJob(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['openPendingStandaloneJob']>[0],
  ) {
    return createPendingStandaloneJob(this.prisma, {
      ...input,
      inputMeta: input.inputMeta as Prisma.InputJsonValue,
    });
  }

  persistPendingInputImages(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['persistPendingInputImages']>[0],
  ) {
    return persistPendingInputImages(this.prisma, input);
  }

  setSelectedCandidate(id: string, organizationId: string, selectedUrl: string | null) {
    return setSelectedCandidate(this.prisma, id, organizationId, selectedUrl);
  }

  clearReadySelections(organizationId: string) {
    return clearReadySelections(this.prisma, organizationId);
  }

  applyGenerationToMaster(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['applyGenerationToMaster']>[0],
  ) {
    return applyGenerationToMaster(this.prisma, input);
  }

  markGenerationCancelled(id: string, organizationId: string) {
    return markGenerationCancelled(this.prisma, id, organizationId);
  }

  deleteGeneration(id: string, organizationId: string) {
    return deleteGeneration(this.prisma, id, organizationId);
  }

  removeCandidate(input: Parameters<ThumbnailGenerationLedgerRepositoryPort['removeCandidate']>[0]) {
    return removeCandidate(this.prisma, input);
  }

  resetGenerationForReEdit(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['resetGenerationForReEdit']>[0],
  ) {
    return resetGenerationForReEdit(this.prisma, input);
  }

  replaceLegacyEditResult(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['replaceLegacyEditResult']>[0],
  ) {
    return replaceGenerationResult(this.prisma, {
      ...input,
      inputMeta: input.inputMeta as Prisma.InputJsonValue,
    });
  }

  markGenerationFailed(id: string, organizationId: string, message: string) {
    return markGenerationFailed(this.prisma, id, organizationId, message);
  }

  claimForDirectProjection(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['claimForDirectProjection']>[0],
  ) {
    return lockGenerationForProcessing(this.prisma, input.generationId, input.organizationId);
  }

  projectDirectSuccess(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['projectDirectSuccess']>[0],
  ) {
    return applyDirectSuccessResult(this.prisma, {
      ...input,
      inputMeta: input.inputMeta as Prisma.InputJsonValue,
    });
  }

  projectDirectFailure(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['projectDirectFailure']>[0],
  ) {
    return markGenerationFailed(
      this.prisma,
      input.generationId,
      input.organizationId,
      input.errorMessage,
    );
  }

  async findGenerationProjectionStatus(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['findGenerationProjectionStatus']>[0],
  ) {
    return this.prisma.thumbnailGeneration.findFirst({
      where: {
        id: input.generationId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      select: { id: true, status: true, phase: true, inputMeta: true, errorMessage: true },
    });
  }

  async findRecentlyTerminalGenerations(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['findRecentlyTerminalGenerations']>[0],
  ) {
    return this.prisma.thumbnailGeneration.findMany({
      where: {
        organizationId: input.organizationId,
        isDeleted: false,
        status: { notIn: ['pending', 'running'] },
        updatedAt: { gte: input.since },
      },
      select: { id: true, status: true, errorMessage: true },
      orderBy: { updatedAt: 'desc' },
      take: input.limit,
    });
  }

  async findStaleNonTerminalGenerations(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['findStaleNonTerminalGenerations']>[0],
  ) {
    return this.prisma.thumbnailGeneration.findMany({
      where: {
        organizationId: input.organizationId,
        isDeleted: false,
        status: { in: ['pending', 'running'] },
        updatedAt: { lt: input.staleBefore },
      },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: input.limit,
    });
  }

  async readParentAlertLink(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['readParentAlertLink']>[0],
  ): Promise<ThumbnailGenerationParentAlertLink | null> {
    const row = await this.prisma.thumbnailGeneration.findFirst({
      where: {
        id: input.generationId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      select: { inputMeta: true },
    });
    return readProductGenerationAlertLink(row?.inputMeta);
  }
}

type _LedgerRow = ThumbnailGenerationLedgerRow;

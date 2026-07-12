import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  SOURCING_AGENT_GATEWAY_PORT,
  type SourcingAgentGatewayPort,
} from '../port/out/runtime/sourcing-agent.gateway.port';
import {
  SOURCING_PRODUCTS_CATALOG_PORT,
  type PromoteCandidateInput,
  type SourcingProductsCatalogPort,
} from '../port/out/cross-domain/products-catalog.port';
import type { SourcingRepositoryTransaction } from '../port/out/transaction/repository-transaction';
import {
  SOURCING_CANDIDATE_REPOSITORY_PORT,
  type SourcingCandidateRepositoryPort,
} from '../port/out/repository/sourcing-candidate.repository.port';
import type {
  PromoteCandidateCommand,
  RejectCandidateCommand,
} from '../port/in/sourcing.commands';
import {
  PRODUCT_PREPARATION_REPOSITORY_PORT,
  type ProductPreparationRepositoryPort,
} from '../port/out/repository/product-preparation.repository.port';

interface SelectedThumbnailImage {
  url: string;
  generationId: string | null;
  generationCandidateId: string | null;
  contentWorkspaceId: string | null;
  storageKey: string | null;
  source: string;
  role: string;
  label: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
}

/**
 * Sourcing-domain use-cases for the candidate state machine:
 *   - promote(candidateId, organizationId, body, ...) — creates a master via
 *     `SOURCING_PRODUCTS_CATALOG_PORT.promoteCandidate` inside a single
 *     repository-owned transaction that also holds the candidate row lock and
 *     flips its status to `promoted` + sets `promotedMasterId`.
 *   - reject(candidateId, organizationId, body, userId) — status='rejected'
 *     with `rejectedReason`, `rejectedAt`, `rejectedByUserId` (D3 — row
 *     preserved).
 *
 * Multi-tenant guarantees:
 *   - All candidate reads use `findFirst({ id, organizationId, isDeleted: false })`
 *     (root AGENTS.md "Multi-tenant scope"). `findUnique({ id })` is banned.
 *   - The cross-domain master creation passes `organizationId` from
 *     `@CurrentOrganization()` into the port; client bodies cannot supply it.
 *
 * Race guarantees:
 *   - `SELECT id FROM sourcing_candidates WHERE id = ${id}::uuid FOR UPDATE`
 *     uses a tagged template (`$queryRaw`) — `$queryRawUnsafe` is banned by
 *     root AGENTS.md and apps/server/AGENTS.md "Data Access And Naming".
 *   - After locking, the row is re-read for `promotedMasterId IS NULL` and
 *     `status === 'sourced'` so a concurrent promoter that already won the
 *     race surfaces as a ConflictException, not a duplicate master.
 *
 * Post-promotion hook:
 *   - After commit, `SOURCING_AGENT_GATEWAY_PORT.notifyPromoted` is fired
 *     fire-and-forget. The gateway swallows internal errors (Phase 2 adapter
 *     raises an OperationAlert) so the HTTP path always reports the
 *     promotion outcome to the caller.
 *   - `body.skipPostPromotionHooks === true` is an ops escape hatch (e.g.
 *     bulk-import promotion that does not want AI to fire).
 */
@Injectable()
export class SourcingPromotionService {
  private readonly logger = new Logger(SourcingPromotionService.name);

  constructor(
    @Inject(SOURCING_CANDIDATE_REPOSITORY_PORT)
    private readonly candidates: SourcingCandidateRepositoryPort,
    @Inject(SOURCING_PRODUCTS_CATALOG_PORT)
    private readonly productsCatalog: SourcingProductsCatalogPort,
    @Inject(SOURCING_AGENT_GATEWAY_PORT)
    private readonly agentGateway: SourcingAgentGatewayPort,
    @Inject(PRODUCT_PREPARATION_REPOSITORY_PORT)
    private readonly preparations: ProductPreparationRepositoryPort,
  ) {}

  async promote(
    candidateId: string,
    organizationId: string,
    body: PromoteCandidateCommand,
  ): Promise<{
    masterId: string;
    masterCode: string;
    selectedThumbnailUrl: string | null;
    selectedDetailPageArtifactId: string | null;
    selectedDetailPageRevisionId: string | null;
  }> {
    const result = await this.candidates.runInTransaction(
      async (tx) => {
        // 1. tenant-scoped pre-check — null is 404, non-sourced is 422.
        const pre = await this.candidates.findCandidateState(tx, {
          id: candidateId,
          organizationId,
        });
        if (!pre) throw new NotFoundException('Sourcing candidate not found');
        if (pre.status !== 'sourced') {
          throw new UnprocessableEntityException(
            `Candidate cannot be promoted from status '${pre.status}'`,
          );
        }

        // 2. row lock — tagged template only (root AGENTS.md raw-SQL contract).
        //    Re-read inside the lock to catch a concurrent promoter that
        //    already won the race; a stale read here would let us write a
        //    second master for the same candidate.
        await this.candidates.lockCandidate(tx, {
          id: candidateId,
          organizationId,
        });
        const locked = await this.candidates.findLockedPromotionCandidate(tx, {
          id: candidateId,
          organizationId,
        });
        if (!locked) throw new NotFoundException('Sourcing candidate not found');
        if (locked.status !== 'sourced' || locked.promotedMasterId !== null) {
          throw new ConflictException(
            'Sourcing candidate is already promoted or rejected',
          );
        }

        const existingPreparation = await this.candidates.findPromotionPreparationSelection(tx, {
          organizationId,
          candidateId,
        });
        const preparedInput = this.jsonRecord(existingPreparation?.registrationInput);
        const preparedName = this.stringValue(preparedInput.name ?? preparedInput.productName) ?? locked.name;
        const preparedDescription =
          this.stringValue(preparedInput.description) ?? locked.description;
        const preparedCategory =
          this.stringValue(preparedInput.category) ?? locked.category;
        const preparedTags = this.stringArray(preparedInput.tags);

        const selectedThumbnail = await this.resolveSelectedThumbnail(tx, {
          organizationId,
          candidateId,
          selectedThumbnailUrl: body.selectedThumbnailUrl ?? existingPreparation?.selectedThumbnailUrl ?? undefined,
          selectedThumbnailGenerationCandidateId:
            body.selectedThumbnailGenerationCandidateId ??
            existingPreparation?.selectedThumbnailGenerationCandidateId ??
            undefined,
        });
        const selectedThumbnailUrl = selectedThumbnail?.url ?? null;

        const selectedDetailPage = await this.resolveSelectedDetailPage(tx, {
          organizationId,
          candidateId,
          contentGenerationId:
            body.selectedDetailPageGenerationId ??
            existingPreparation?.selectedDetailPageGenerationId ??
            undefined,
          artifactId:
            body.selectedDetailPageArtifactId ??
            existingPreparation?.selectedDetailPageArtifactId ??
            undefined,
          revisionId:
            body.selectedDetailPageRevisionId ??
            existingPreparation?.selectedDetailPageRevisionId ??
            undefined,
        });
        const promotionImages = this.buildPromotionImages(
          locked.images,
          selectedThumbnail,
        );

        // 3. delegate master creation to products domain via the outgoing port.
        const promotionInput: PromoteCandidateInput = {
          candidateSnapshot: {
            name: preparedName,
            description: preparedDescription,
            category: preparedCategory,
            brand: null,
            tags: preparedTags.length > 0 ? preparedTags : this.parseTags(locked.tags),
            thumbnailUrl: selectedThumbnailUrl ?? locked.thumbnailUrl,
            imageUrl: selectedThumbnailUrl ?? locked.imageUrl,
            sourceImages: promotionImages,
          },
          options: body.options.map((opt) => ({
            optionName: opt.optionName,
            legacyCode: opt.legacyCode,
            barcode: opt.barcode,
          })),
        };
        const promotion = await this.productsCatalog.promoteCandidate(
          tx,
          organizationId,
          promotionInput,
        );

        // 4. flip candidate status with the same tenant predicate used for
        //    the row lock, so the repository port remains safe if reused.
        const promoted = await this.candidates.markCandidatePromoted(tx, {
          id: candidateId,
          organizationId,
          masterId: promotion.masterId,
        });
        if (promoted.count === 0) {
          throw new ConflictException(
            'Sourcing candidate state changed concurrently',
          );
        }

        if (selectedDetailPage) {
          await this.attachSelectedDetailPageArtifact(tx, {
            organizationId,
            artifactId: selectedDetailPage.artifactId,
            targetMasterId: promotion.masterId,
            revisionId: selectedDetailPage.revisionId,
          });
        }

        await this.upsertProductPreparation(tx, {
          organizationId,
          candidateId,
          masterId: promotion.masterId,
          displayName: preparedName,
          existingRegistrationInput: preparedInput,
          lockedCandidate: {
            name: preparedName,
            description: preparedDescription,
            category: preparedCategory,
            thumbnailUrl: locked.thumbnailUrl,
            imageUrl: locked.imageUrl,
          },
          selectedThumbnail,
          selectedDetailPage,
          options: body.options,
        });

        return {
          ...promotion,
          selectedThumbnailUrl,
          selectedDetailPageArtifactId: selectedDetailPage?.artifactId ?? null,
          selectedDetailPageRevisionId: selectedDetailPage?.revisionId ?? null,
        };
      },
      { timeout: 15000 },
    );

    // 5. post-commit fire-and-forget AI trigger (Phase 4 + Phase 2 wiring).
    //    The gateway adapter swallows internal errors via OperationAlert;
    //    re-asserting that here would double-raise. We still wrap in
    //    try/catch so a buggy mock or a transport hiccup never tears down
    //    the HTTP response after a successful commit.
    if (!body.skipPostPromotionHooks) {
      try {
        await this.agentGateway.notifyPromoted({
          organizationId,
          masterId: result.masterId,
        });
      } catch (err) {
        this.logger.error(
          `notifyPromoted post-commit failed for master=${result.masterId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
          err instanceof Error ? err.stack : undefined,
        );
      }
    }

    return result;
  }

  async reject(
    candidateId: string,
    organizationId: string,
    body: RejectCandidateCommand,
    userId: string | null,
  ): Promise<{ status: 'rejected' }> {
    return this.candidates.runInTransaction(async (tx) => {
      await this.candidates.lockCandidate(tx, {
        id: candidateId,
        organizationId,
      });
      const candidate = await this.candidates.findCandidateState(tx, {
        id: candidateId,
        organizationId,
      });
      if (!candidate) throw new NotFoundException('Sourcing candidate not found');
      if (candidate.status !== 'sourced') {
        throw new UnprocessableEntityException(
          `Candidate cannot be rejected from status '${candidate.status}'`,
        );
      }
      await this.preparations.assertCandidateTerminalTransitionAllowed(tx, {
        organizationId,
        sourceCandidateId: candidateId,
      });
      // tenant-scoped predicate keeps the bare-id write off the SQL path.
      const { count } = await this.candidates.rejectCandidate(tx, {
        id: candidateId,
        organizationId,
        reason: body.reason ?? null,
        rejectedByUserId: userId,
        rejectedAt: new Date(),
      });
      if (count === 0) {
        // status flipped between pre-check and write — treat as race.
        throw new ConflictException(
          'Sourcing candidate state changed concurrently',
        );
      }
      return { status: 'rejected' as const };
    });
  }

  /**
   * Normalize the JSON-serialized `tags` column into the `string[]` shape
   * the products-domain promotion service expects. Non-string entries are
   * dropped because downstream policy treats tags as plain text labels.
   */
  private parseTags(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((t): t is string => typeof t === 'string');
  }

  private toJson(value: unknown): Record<string, unknown> {
    return this.jsonRecord(JSON.parse(JSON.stringify(value)));
  }

  private jsonRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }

  private stringValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  }

  private normalizeSelectedThumbnailUrl(value: string | undefined): string | null {
    const selected = value?.trim();
    if (!selected) return null;
    if (/^(https?:\/\/|data:image\/)/i.test(selected)) return selected;
    throw new BadRequestException('selectedThumbnailUrl must be an http(s) URL or data:image URL');
  }

  private async resolveSelectedThumbnail(
    tx: SourcingRepositoryTransaction,
    input: {
      organizationId: string;
      candidateId: string;
      selectedThumbnailUrl?: string;
      selectedThumbnailGenerationCandidateId?: string;
    },
  ): Promise<SelectedThumbnailImage | null> {
    const selectedUrl = this.normalizeSelectedThumbnailUrl(input.selectedThumbnailUrl);
    const generationCandidateId = input.selectedThumbnailGenerationCandidateId?.trim() || null;
    if (!generationCandidateId) {
      return selectedUrl
        ? {
            url: selectedUrl,
            generationId: null,
            generationCandidateId: null,
            contentWorkspaceId: null,
            storageKey: null,
            source: 'sourcing-registration-selection',
            role: 'product',
            label: 'selected thumbnail',
          }
        : null;
    }

    const generated = await this.candidates.findSelectedThumbnailGeneration(tx, {
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      generationCandidateId,
    });
    if (!generated) {
      throw new BadRequestException(
        'selectedThumbnailGenerationCandidateId must belong to this sourcing candidate',
      );
    }
    if (selectedUrl && selectedUrl !== generated.url) {
      throw new BadRequestException(
        'selectedThumbnailUrl must match selectedThumbnailGenerationCandidateId',
      );
    }
    return {
      url: generated.url,
      generationId: generated.generationId,
      generationCandidateId: generated.id,
      contentWorkspaceId: generated.contentWorkspaceId,
      storageKey: generated.storageKey,
      source: 'thumbnail_generation',
      role: 'product',
      label: 'AI thumbnail',
      mimeType: generated.mimeType,
      width: generated.width,
      height: generated.height,
      fileSize: generated.fileSize,
    };
  }

  private buildPromotionImages(
    images: Array<{
      url: string;
      storageKey: string | null;
      sortOrder: number;
      isPrimary: boolean;
      source: string;
      role: string;
      label: string | null;
    }>,
    selectedThumbnail: SelectedThumbnailImage | null,
  ): PromoteCandidateInput['candidateSnapshot']['sourceImages'] {
    const ordered = [...images].sort((a, b) => a.sortOrder - b.sortOrder);
    const mapped = ordered.map((img) => ({
      url: img.url,
      storageKey: img.storageKey,
      sortOrder: img.sortOrder,
      isPrimary: img.isPrimary,
      source: img.source,
      role: img.role,
      label: img.label,
    }));

    if (!selectedThumbnail) {
      return mapped.map((img, index) => ({
        ...img,
        sortOrder: index,
        isPrimary: index === 0,
      }));
    }

    const selectedIndex = mapped.findIndex((img) => img.url === selectedThumbnail.url);
    const selected = selectedIndex >= 0
      ? mapped.splice(selectedIndex, 1)[0]
      : {
          url: selectedThumbnail.url,
          storageKey: selectedThumbnail.storageKey,
          sortOrder: 0,
          isPrimary: true,
          source: selectedThumbnail.source,
          role: selectedThumbnail.role,
          label: selectedThumbnail.label,
          mimeType: selectedThumbnail.mimeType ?? null,
          width: selectedThumbnail.width ?? null,
          height: selectedThumbnail.height ?? null,
          fileSize: selectedThumbnail.fileSize ?? null,
        };

    return [selected, ...mapped].map((img, index) => ({
      ...img,
      sortOrder: index,
      isPrimary: index === 0,
    }));
  }

  private async resolveSelectedDetailPage(
    tx: SourcingRepositoryTransaction,
    input: {
      organizationId: string;
      candidateId: string;
      contentGenerationId?: string;
      artifactId?: string;
      revisionId?: string;
    },
  ): Promise<{
    artifactId: string;
    revisionId: string | null;
    contentGenerationId: string | null;
    contentWorkspaceId: string | null;
  } | null> {
    const artifactId = input.artifactId?.trim() || null;
    const contentGenerationId = input.contentGenerationId?.trim() || null;
    const revisionId = input.revisionId?.trim() || null;

    if (!artifactId && !contentGenerationId) {
      if (revisionId) {
        throw new BadRequestException(
          'selectedDetailPageRevisionId requires a selected detail-page artifact or generation',
        );
      }
      return null;
    }

    const selected = artifactId
      ? await this.resolveSelectedDetailPageArtifact(tx, {
          organizationId: input.organizationId,
          candidateId: input.candidateId,
          artifactId,
          contentGenerationId,
        })
      : await this.resolveSelectedDetailPageGeneration(tx, {
          organizationId: input.organizationId,
          candidateId: input.candidateId,
          contentGenerationId: contentGenerationId!,
        });

    if (revisionId) {
      const revision = await this.candidates.findDetailPageRevision(tx, {
        organizationId: input.organizationId,
        artifactId: selected.artifactId,
        revisionId,
      });
      if (!revision) {
        throw new BadRequestException(
          'selectedDetailPageRevisionId must belong to the selected detail-page artifact',
        );
      }
      return { ...selected, revisionId: revision.id };
    }

    return selected;
  }

  private async resolveSelectedDetailPageGeneration(
    tx: SourcingRepositoryTransaction,
    input: {
      organizationId: string;
      candidateId: string;
      contentGenerationId: string;
    },
  ): Promise<{
    artifactId: string;
    revisionId: string | null;
    contentGenerationId: string;
    contentWorkspaceId: string | null;
  }> {
    const generation = await this.candidates.findSelectedDetailPageGeneration(tx, {
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      contentGenerationId: input.contentGenerationId,
    });
    if (!generation) {
      throw new BadRequestException(
        'selectedDetailPageGenerationId must belong to this sourcing candidate and have a detail-page artifact',
      );
    }

    return {
      artifactId: generation.artifactId,
      revisionId: generation.revisionId,
      contentGenerationId: input.contentGenerationId,
      contentWorkspaceId: generation.contentWorkspaceId,
    };
  }

  private async resolveSelectedDetailPageArtifact(
    tx: SourcingRepositoryTransaction,
    input: {
      organizationId: string;
      candidateId: string;
      artifactId: string;
      contentGenerationId: string | null;
    },
  ): Promise<{
    artifactId: string;
    revisionId: string | null;
    contentGenerationId: string | null;
    contentWorkspaceId: string | null;
  }> {
    const artifact = await this.candidates.findSelectedDetailPageArtifact(tx, {
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      artifactId: input.artifactId,
    });
    if (!artifact) {
      throw new BadRequestException(
        'selectedDetailPageArtifactId must belong to this sourcing candidate',
      );
    }
    if (input.contentGenerationId && artifact.contentGenerationId !== input.contentGenerationId) {
      throw new BadRequestException(
        'selectedDetailPageArtifactId does not match selectedDetailPageGenerationId',
      );
    }

    return {
      artifactId: artifact.artifactId,
      revisionId: artifact.revisionId,
      contentGenerationId: input.contentGenerationId ?? artifact.contentGenerationId,
      contentWorkspaceId: artifact.contentWorkspaceId,
    };
  }

  private async attachSelectedDetailPageArtifact(
    tx: SourcingRepositoryTransaction,
    input: {
      organizationId: string;
      artifactId: string;
      targetMasterId: string;
      revisionId: string | null;
    },
  ): Promise<void> {
    const updated = await this.candidates.attachSelectedDetailPageArtifact(tx, {
      organizationId: input.organizationId,
      artifactId: input.artifactId,
      targetMasterId: input.targetMasterId,
      revisionId: input.revisionId,
    });
    if (updated.count === 0) {
      throw new BadRequestException('selected detail-page artifact could not be attached');
    }
  }

  private async upsertProductPreparation(
    tx: SourcingRepositoryTransaction,
    input: {
      organizationId: string;
      candidateId: string;
      masterId: string;
      displayName: string;
      existingRegistrationInput?: Record<string, unknown>;
      lockedCandidate: {
        name: string;
        description: string;
        category: string | null;
        thumbnailUrl: string | null;
        imageUrl: string | null;
      };
      selectedThumbnail: SelectedThumbnailImage | null;
      selectedDetailPage: {
        artifactId: string;
        revisionId: string | null;
        contentGenerationId: string | null;
        contentWorkspaceId: string | null;
      } | null;
      options: PromoteCandidateCommand['options'];
    },
  ): Promise<void> {
    const contentWorkspaceId =
      input.selectedDetailPage?.contentWorkspaceId ??
      input.selectedThumbnail?.contentWorkspaceId ??
      null;
    const registrationInput = this.toJson({
      ...(input.existingRegistrationInput ?? {}),
      sourceCandidateId: input.candidateId,
      name: input.lockedCandidate.name,
      productName: input.lockedCandidate.name,
      description: input.lockedCandidate.description,
      category: input.lockedCandidate.category,
      thumbnailUrl: input.lockedCandidate.thumbnailUrl,
      imageUrl: input.lockedCandidate.imageUrl,
      options: input.options,
      selectedThumbnailUrl: input.selectedThumbnail?.url ?? null,
      selectedThumbnailGenerationId: input.selectedThumbnail?.generationId ?? null,
      selectedThumbnailGenerationCandidateId: input.selectedThumbnail?.generationCandidateId ?? null,
      selectedDetailPageArtifactId: input.selectedDetailPage?.artifactId ?? null,
      selectedDetailPageRevisionId: input.selectedDetailPage?.revisionId ?? null,
      selectedDetailPageGenerationId: input.selectedDetailPage?.contentGenerationId ?? null,
    });
    await this.candidates.upsertPromotedProductPreparation(tx, {
      organizationId: input.organizationId,
      candidateId: input.candidateId,
      masterId: input.masterId,
      contentWorkspaceId,
      displayName: input.displayName,
      appliedToMasterAt: new Date(),
      selectedThumbnailUrl: input.selectedThumbnail?.url ?? null,
      selectedThumbnailGenerationId: input.selectedThumbnail?.generationId ?? null,
      selectedThumbnailGenerationCandidateId: input.selectedThumbnail?.generationCandidateId ?? null,
      selectedDetailPageArtifactId: input.selectedDetailPage?.artifactId ?? null,
      selectedDetailPageRevisionId: input.selectedDetailPage?.revisionId ?? null,
      selectedDetailPageGenerationId: input.selectedDetailPage?.contentGenerationId ?? null,
      registrationInput,
    });
  }
}

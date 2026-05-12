import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  SOURCING_AGENT_GATEWAY_PORT,
  type SourcingAgentGatewayPort,
} from '../port/out/sourcing-agent.gateway.port';
import {
  SOURCING_PRODUCTS_CATALOG_PORT,
  type PromoteCandidateInput,
  type SourcingProductsCatalogPort,
} from '../port/out/products-catalog.port';
import type { PromoteCandidateBodyDto } from '../../adapter/in/http/dto/promote-candidate.dto';
import type { RejectCandidateBodyDto } from '../../adapter/in/http/dto/reject-candidate.dto';

/**
 * Sourcing-domain use-cases for the candidate state machine:
 *   - promote(candidateId, organizationId, body, ...) — creates a master via
 *     `SOURCING_PRODUCTS_CATALOG_PORT.promoteCandidate` inside a single
 *     `$transaction` that also holds the candidate row lock and flips its
 *     status to `promoted` + sets `promotedMasterId`.
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
    private readonly prisma: PrismaService,
    @Inject(SOURCING_PRODUCTS_CATALOG_PORT)
    private readonly productsCatalog: SourcingProductsCatalogPort,
    @Inject(SOURCING_AGENT_GATEWAY_PORT)
    private readonly agentGateway: SourcingAgentGatewayPort,
  ) {}

  async promote(
    candidateId: string,
    organizationId: string,
    body: PromoteCandidateBodyDto,
  ): Promise<{ masterId: string; masterCode: string }> {
    const result = await this.prisma.$transaction(
      async (tx) => {
        // 1. tenant-scoped pre-check — null is 404, non-sourced is 422.
        const pre = await tx.sourcingCandidate.findFirst({
          where: { id: candidateId, organizationId, isDeleted: false },
          select: { id: true, status: true },
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
        await tx.$queryRaw`
          SELECT id FROM sourcing_candidates
          WHERE id = ${candidateId}::uuid
            AND organization_id = ${organizationId}::uuid
          FOR UPDATE
        `;
        const locked = await tx.sourcingCandidate.findFirst({
          where: { id: candidateId, organizationId, isDeleted: false },
          include: {
            images: {
              where: { isDeleted: false },
              orderBy: { sortOrder: 'asc' },
            },
          },
        });
        if (!locked) throw new NotFoundException('Sourcing candidate not found');
        if (locked.status !== 'sourced' || locked.promotedMasterId !== null) {
          throw new ConflictException(
            'Sourcing candidate is already promoted or rejected',
          );
        }

        // 3. delegate master creation to products domain via the outgoing port.
        const promotionInput: PromoteCandidateInput = {
          candidateSnapshot: {
            name: locked.name,
            description: locked.description,
            category: locked.category,
            brand: null,
            tags: this.parseTags(locked.tags),
            thumbnailUrl: locked.thumbnailUrl,
            imageUrl: locked.imageUrl,
            sourceImages: locked.images.map((img) => ({
              url: img.url,
              storageKey: img.storageKey,
              sortOrder: img.sortOrder,
              isPrimary: img.isPrimary,
              source: img.source,
              role: img.role,
              label: img.label,
            })),
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

        // 4. flip candidate status — bare-id update is permitted here because
        //    the row was locked + tenant-scoped at step 2; an out-of-tenant id
        //    cannot reach this line.
        await tx.sourcingCandidate.update({
          where: { id: candidateId },
          data: {
            status: 'promoted',
            promotedMasterId: promotion.masterId,
          },
        });

        return promotion;
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
    body: RejectCandidateBodyDto,
    userId: string | null,
  ): Promise<{ status: 'rejected' }> {
    return this.prisma.$transaction(async (tx) => {
      const candidate = await tx.sourcingCandidate.findFirst({
        where: { id: candidateId, organizationId, isDeleted: false },
        select: { id: true, status: true },
      });
      if (!candidate) throw new NotFoundException('Sourcing candidate not found');
      if (candidate.status !== 'sourced') {
        throw new UnprocessableEntityException(
          `Candidate cannot be rejected from status '${candidate.status}'`,
        );
      }
      // tenant-scoped predicate keeps the bare-id write off the SQL path.
      const { count } = await tx.sourcingCandidate.updateMany({
        where: { id: candidateId, organizationId, isDeleted: false, status: 'sourced' },
        data: {
          status: 'rejected',
          rejectedAt: new Date(),
          rejectedReason: body.reason ?? null,
          rejectedByUserId: userId,
        },
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
}

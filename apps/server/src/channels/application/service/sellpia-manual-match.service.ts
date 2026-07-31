import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  MAX_SELLPIA_MANUAL_MATCH_TARGETS,
  SellpiaManualMatchImportResponseSchema,
  SellpiaManualMatchSnapshotSchema,
  SellpiaManualMatchTargetsResponseSchema,
  type SellpiaManualMatchRow,
} from '@kiditem/shared/sellpia-manual-match';
import { normalizeSellpiaManualMatchAlias } from '../../domain/sellpia-manual-match-alias';
import {
  SELLPIA_RECIPE_EVIDENCE_PORT,
  type SellpiaRecipeEvidencePort,
} from '../port/out/cross-domain/sellpia-recipe-evidence.port';
import {
  SELLPIA_MANUAL_MATCH_REPOSITORY_PORT,
  type SellpiaManualMatchAliasRecord,
  type SellpiaManualMatchRepositoryPort,
} from '../port/out/repository/sellpia-manual-match.repository.port';

const POSTGRES_INTEGER_MAX = 2_147_483_647;

@Injectable()
export class SellpiaManualMatchService {
  constructor(
    @Inject(SELLPIA_RECIPE_EVIDENCE_PORT)
    private readonly inventory: SellpiaRecipeEvidencePort,
    @Inject(SELLPIA_MANUAL_MATCH_REPOSITORY_PORT)
    private readonly repository: SellpiaManualMatchRepositoryPort,
  ) {}

  async targets(organizationId: string) {
    const [activeSkus, currentSnapshot] = await Promise.all([
      this.inventory.listActiveForMatching(organizationId),
      this.repository.getCurrentStatus(organizationId),
    ]);
    const targetCodes = [...new Set(activeSkus.map((sku) => sku.code))].sort();
    if (targetCodes.length > MAX_SELLPIA_MANUAL_MATCH_TARGETS) {
      throw new ConflictException(
        `Sellpia manual-match collection supports at most ${MAX_SELLPIA_MANUAL_MATCH_TARGETS} active SKUs`,
      );
    }
    return SellpiaManualMatchTargetsResponseSchema.parse({
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourcePath: '/product_manual_match.html',
      version: 1,
      targetCount: targetCodes.length,
      targetCodes,
      currentSnapshot,
    });
  }

  async import(organizationId: string, body: unknown) {
    const parsed = SellpiaManualMatchSnapshotSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'sellpia_manual_match_invalid_snapshot',
        message: 'Sellpia manual-match snapshot is invalid',
        issues: parsed.error.issues.slice(0, 20),
      });
    }
    const snapshot = parsed.data;
    const [activeSkus, currentChannelAliases] = await Promise.all([
      this.inventory.listActiveForMatching(organizationId),
      this.repository.listCurrentChannelAliasCandidates(organizationId),
    ]);
    const activeByCode = new Map(activeSkus.map((sku) => [sku.code, sku]));
    const currentTargetCodes = [...activeByCode.keys()].sort();
    if (!sameStrings(currentTargetCodes, snapshot.targetCodes)) {
      throw new ConflictException(
        'Active Sellpia inventory changed during manual-match collection; collect again',
      );
    }

    const normalizedChannelAliases = [...new Set(currentChannelAliases
      .map(normalizeSellpiaManualMatchAlias)
      .filter(Boolean))].sort();
    const rows = aggregateRows(
      snapshot.rows,
      activeByCode,
      new Set(normalizedChannelAliases),
    );
    const matchedTargetCount = new Set(rows.map((row) => row.sellpiaInventorySkuId)).size;
    const status = {
      targetCount: snapshot.targetCount,
      matchedTargetCount,
      aliasCount: rows.length,
      snapshotHash: createHash('sha256')
        .update(JSON.stringify({ snapshot, normalizedChannelAliases }))
        .digest('hex'),
      capturedAt: new Date().toISOString(),
    };
    await this.repository.replaceCurrent({ organizationId, status, rows });
    return SellpiaManualMatchImportResponseSchema.parse({ status });
  }
}

function aggregateRows(
  rows: SellpiaManualMatchRow[],
  activeByCode: Map<string, { sellpiaInventorySkuId: string }>,
  currentChannelAliases: Set<string>,
): SellpiaManualMatchAliasRecord[] {
  const aggregated = new Map<string, SellpiaManualMatchAliasRecord>();
  for (const row of rows) {
    const sku = activeByCode.get(row.productCode);
    if (!sku) {
      throw new ConflictException(
        `Sellpia manual-match row references inactive code ${row.productCode}`,
      );
    }
    const normalizedAlias = normalizeSellpiaManualMatchAlias(row.aliasTitle);
    if (!normalizedAlias || !currentChannelAliases.has(normalizedAlias)) continue;
    const key = [normalizedAlias, sku.sellpiaInventorySkuId, row.itemCount].join('\u0000');
    const previous = aggregated.get(key);
    aggregated.set(key, previous ? {
      ...previous,
      aliasTitle: previous.aliasTitle.localeCompare(row.aliasTitle, 'ko') <= 0
        ? previous.aliasTitle
        : row.aliasTitle,
      matchedType: strongerMatchedType(previous.matchedType, row.matchedType),
      evidenceCount: Math.min(
        POSTGRES_INTEGER_MAX,
        previous.evidenceCount + row.evidenceCount,
      ),
    } : {
      sellpiaInventorySkuId: sku.sellpiaInventorySkuId,
      aliasTitle: row.aliasTitle,
      normalizedAlias,
      itemCount: row.itemCount,
      matchedType: row.matchedType,
      evidenceCount: row.evidenceCount,
    });
  }
  return [...aggregated.values()].sort((left, right) =>
    left.normalizedAlias.localeCompare(right.normalizedAlias)
      || left.sellpiaInventorySkuId.localeCompare(right.sellpiaInventorySkuId)
      || left.itemCount - right.itemCount);
}

function strongerMatchedType(
  left: 'M' | 'P' | 'E',
  right: 'M' | 'P' | 'E',
): 'M' | 'P' | 'E' {
  const priority = { M: 3, P: 2, E: 1 } as const;
  return priority[left] >= priority[right] ? left : right;
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

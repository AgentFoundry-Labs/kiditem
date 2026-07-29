import { Injectable } from '@nestjs/common';
import type {
  CoupangCategorySuggestion,
  CoupangCategorySuggestionResponse,
} from '@kiditem/shared/coupang-category';
import { PrismaService } from '../../prisma/prisma.service';
import {
  inferCoupangCategory,
  type CategoryCorpusEntry,
} from '../domain/coupang-category-inference';

/** 기존 활성 쿠팡 리스팅을 코퍼스로 신규 상품의 WING 카테고리를 제안한다. */
@Injectable()
export class CoupangCategorySuggestionService {
  constructor(private readonly prisma: PrismaService) {}

  async suggest(
    organizationId: string,
    names: string[],
  ): Promise<CoupangCategorySuggestionResponse> {
    const corpus = await this.loadCorpus(organizationId);
    return {
      corpusSize: corpus.length,
      results: names.map((name) => ({
        name,
        suggestion: toSuggestion(inferCoupangCategory(name, corpus)),
      })),
    };
  }

  private async loadCorpus(organizationId: string): Promise<CategoryCorpusEntry[]> {
    const rows = await this.prisma.channelListing.findMany({
      where: {
        organizationId,
        isActive: true,
        channelAccount: {
          is: {
            organizationId,
            channel: 'coupang',
            status: 'active',
          },
        },
        OR: [
          { channelName: { not: null } },
          { displayName: { not: null } },
        ],
        category: { startsWith: '[' },
      },
      select: { channelName: true, displayName: true, category: true },
    });

    return rows.flatMap((row) => {
      const displayName = row.displayName ?? row.channelName;
      return displayName && row.category
        ? [{
            registeredName: row.channelName,
            displayName,
            categoryCell: row.category,
          }]
        : [];
    });
  }
}

function toSuggestion(
  inference: ReturnType<typeof inferCoupangCategory>,
): CoupangCategorySuggestion | null {
  if (!inference) return null;
  return {
    categoryCell: inference.cell.raw,
    code: inference.cell.code,
    path: inference.cell.path,
    leaf: inference.cell.leaf,
    score: inference.score,
    confidence: inference.confidence,
    basedOn: inference.basedOn.slice(0, 5),
    support: inference.support,
  } satisfies CoupangCategorySuggestion;
}

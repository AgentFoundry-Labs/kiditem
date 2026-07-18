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

/**
 * 기존 쿠팡 리스팅을 코퍼스로 삼아 신규 상품명의 카테고리를 제안한다.
 *
 * 코퍼스는 `ChannelListing`(쿠팡 워크북 passthrough)의 (노출상품명 → `[코드] 경로`) 쌍이다.
 * 수집상품의 자유 텍스트 카테고리로는 WING 등록이 불가능하기 때문에 이 경로가 필요하다.
 */
@Injectable()
export class CoupangCategorySuggestionService {
  constructor(private readonly prisma: PrismaService) {}

  async suggest(
    organizationId: string,
    names: string[],
  ): Promise<CoupangCategorySuggestionResponse> {
    const corpus = await this.loadCorpus(organizationId);

    const results = names.map((name) => ({
      name,
      suggestion: toSuggestion(inferCoupangCategory(name, corpus)),
    }));

    return { corpusSize: corpus.length, results };
  }

  /**
   * `[` 로 시작하는 값만 코퍼스로 쓴다 — 실데이터에는 `64681/1937` 같은 이형이 섞여 있고
   * 도메인 파서가 그런 값을 버리므로 애초에 읽지 않는 편이 싸다.
   */
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
        displayName: { not: null },
        category: { startsWith: '[' },
      },
      select: { displayName: true, category: true },
    });

    return rows.flatMap((row) =>
      row.displayName && row.category
        ? [{ displayName: row.displayName, categoryCell: row.category }]
        : [],
    );
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

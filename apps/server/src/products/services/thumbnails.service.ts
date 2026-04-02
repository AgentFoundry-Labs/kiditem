import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  paginationParams,
  type PaginatedResponse,
} from '../../common/pagination';
import type { ThumbnailListItem, ThumbnailSummary } from '@kiditem/shared';

export type { ThumbnailSummary } from '@kiditem/shared';

type ThumbnailGrade = 'S' | 'A' | 'B' | 'C' | 'F';

export interface GradeDistribution {
  S: number;
  A: number;
  B: number;
  C: number;
  F: number;
}

export interface ThumbnailsListResponse extends PaginatedResponse<ThumbnailListItem> {
  summary: ThumbnailSummary;
}

function assignGrade(ctr: number | null): ThumbnailGrade {
  if (ctr === null || ctr === undefined) return 'F';
  if (ctr >= 5) return 'S';
  if (ctr >= 3) return 'A';
  if (ctr >= 2) return 'B';
  if (ctr >= 1) return 'C';
  return 'F';
}

function buildIssues(
  ctr: number,
  impressions: number,
): { type: string; severity: 'critical' | 'warning' | 'info'; message: string }[] {
  const issues: { type: string; severity: 'critical' | 'warning' | 'info'; message: string }[] = [];
  if (ctr < 1) {
    issues.push({
      type: 'low_ctr',
      severity: 'critical',
      message: `CTR ${ctr.toFixed(2)}% — 긴급 개선 필요`,
    });
  } else if (ctr < 2) {
    issues.push({
      type: 'below_avg_ctr',
      severity: 'warning',
      message: `CTR ${ctr.toFixed(2)}% — 평균 이하`,
    });
  }
  if (impressions > 1000 && ctr < 2) {
    issues.push({
      type: 'high_impression_low_ctr',
      severity: 'critical',
      message: `노출 ${impressions.toLocaleString()}회 대비 클릭률 저조`,
    });
  }
  if (impressions === 0) {
    issues.push({
      type: 'no_data',
      severity: 'info',
      message: '노출 데이터 없음',
    });
  }
  return issues;
}

function buildSuggestions(ctr: number, grade: ThumbnailGrade): string[] {
  const suggestions: string[] = [];
  if (grade === 'F' || grade === 'C') {
    suggestions.push('메인 이미지를 밝고 선명한 배경으로 교체');
    suggestions.push('상품 핵심 특징을 텍스트 오버레이로 추가');
  }
  if (grade === 'B') {
    suggestions.push('A/B 테스트로 이미지 변형 실험 권장');
  }
  if (ctr < 1) {
    suggestions.push('경쟁 상품 썸네일 벤치마킹 필요');
  }
  return suggestions;
}

@Injectable()
export class ThumbnailsService {
  constructor(private readonly prisma: PrismaService) {}

  private mapThumbnail(t: {
    id: string;
    productId: string;
    imageUrl: string;
    ctr: unknown;
    impressions: number;
    clicks: number;
    status: string;
    strategy: string;
    product: { name: string; thumbnailUrl: string | null; imageUrl: string | null; company: { name: string } | null } | null;
  } & Record<string, unknown>): ThumbnailListItem {
    const ctr = t.ctr ? Number(t.ctr) : 0;
    const prevCtr = t['prevClickRate'] ? Number(t['prevClickRate']) : 0;
    const grade = assignGrade(ctr);
    return {
      id: t.id,
      productId: t.productId,
      productName: t.product?.name ?? 'N/A',
      company: t.product?.company?.name ?? 'N/A',
      imageUrl: t.product?.thumbnailUrl ?? t.product?.imageUrl ?? t.imageUrl,
      ctr,
      prevCtr,
      impressions: t.impressions,
      clicks: t.clicks,
      status: t.status,
      strategy: t.strategy,
      grade,
      issues: buildIssues(ctr, t.impressions),
      suggestions: buildSuggestions(ctr, grade),
    } satisfies ThumbnailListItem;
  }

  async findAll(query: {
    page?: string;
    limit?: string;
  }): Promise<ThumbnailsListResponse> {
    try {
      const { page, limit, skip } = paginationParams(query);

      const [allData, totalCount] = await Promise.all([
        this.prisma.thumbnail.findMany({
          include: {
            product: { include: { company: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.thumbnail.count(),
      ]);

      const allMapped = allData.map((t) => this.mapThumbnail(t));

      const gradeDistribution: GradeDistribution = { S: 0, A: 0, B: 0, C: 0, F: 0 };
      for (const item of allMapped) {
        gradeDistribution[item.grade as ThumbnailGrade]++;
      }

      const items = allMapped.slice(skip, skip + limit);

      return {
        items,
        total: totalCount,
        page,
        limit,
        summary: {
          total: totalCount,
          gradeDistribution,
        },
      };
    } catch {
      throw new InternalServerErrorException('썸네일 데이터 조회 실패');
    }
  }

  async getSummary(): Promise<ThumbnailSummary> {
    try {
      const allData = await this.prisma.thumbnail.findMany({
        select: { ctr: true },
      });

      const gradeDistribution: GradeDistribution = { S: 0, A: 0, B: 0, C: 0, F: 0 };
      for (const t of allData) {
        const ctr = t.ctr ? Number(t.ctr) : 0;
        gradeDistribution[assignGrade(ctr)]++;
      }

      return { total: allData.length, gradeDistribution } satisfies ThumbnailSummary;
    } catch {
      throw new InternalServerErrorException('썸네일 요약 조회 실패');
    }
  }
}

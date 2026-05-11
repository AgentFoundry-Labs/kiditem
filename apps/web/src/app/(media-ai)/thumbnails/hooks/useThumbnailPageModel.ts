import { useMemo } from 'react';
import type { ThumbnailAnalysisResult, ThumbnailGenerationItem } from '@kiditem/shared/ai';
import { pickDisplayableImageUrl } from '@/lib/resolve-url';
import { isApplied, isReady } from '../../_shared/lib/thumbnail-status';
import type { MainTabKey } from '../components/ThumbnailMainTabs';
import {
  getEffectiveComplianceGrade,
  needsThumbnailFix,
} from '../lib/thumbnail-classification';
import type { AnalysisListResponse } from './useThumbnailAnalysis';

interface UseThumbnailPageModelParams {
  scanResult: AnalysisListResponse | null | undefined;
  generations: ThumbnailGenerationItem[];
  activeTab: MainTabKey;
  gradeFilter: string;
  searchQuery: string;
  page: number;
  pageSize: number;
  historyPage: number;
  selectedProduct: ThumbnailAnalysisResult | null;
}

const EMPTY_ANALYSIS_RESPONSE: AnalysisListResponse = {
  total: 0,
  analyzed: 0,
  partialCount: 0,
  unclassifiedCount: 0,
  gradeDistribution: {},
  complianceDistribution: {},
  allResults: [],
  unclassified: [],
};

export function useThumbnailPageModel({
  scanResult,
  generations,
  activeTab,
  gradeFilter,
  searchQuery,
  page,
  pageSize,
  historyPage,
  selectedProduct,
}: UseThumbnailPageModelParams) {
  const sq = searchQuery.trim().toLowerCase();

  return useMemo(() => {
    const effectiveScanResult = scanResult ?? EMPTY_ANALYSIS_RESPONSE;
    const { allResults, unclassified = [] } = effectiveScanResult;

    const generatedProductIds = new Set(
      generations.filter((g) => g.status !== 'failed').map((g) => g.productId),
    );
    const activeGenerations = generations.filter(
      (g) => g.status === 'pending' || g.status === 'running' || isReady(g),
    );

    const genByProductId = new Map<string, ThumbnailGenerationItem>();
    for (const generation of generations) {
      const existing = genByProductId.get(generation.productId);
      if (!existing || new Date(generation.createdAt) > new Date(existing.createdAt)) {
        genByProductId.set(generation.productId, generation);
      }
    }

    const historyByProduct = Array.from(genByProductId.values()).filter((g) => {
      if (!isApplied(g)) return false;
      return !!pickDisplayableImageUrl(g.selectedUrl, g.originalUrl, g.product?.imageUrl);
    });

    const classifiedNoImage = allResults.filter((r) => r.analyzed && !r.imageUrl);
    const unclassifiedCount = unclassified.filter((u) => u.imageUrl).length;
    const classifiedResults = allResults.filter((r) => r.analyzed && r.imageUrl);
    const needsFixProducts = classifiedResults.filter(needsThumbnailFix);
    const pendingProducts = needsFixProducts.filter((p) => !genByProductId.has(p.productId));

    const needsFixIds = new Set(needsFixProducts.map((p) => p.productId));
    const validActiveGenerations = activeGenerations.filter((g) => needsFixIds.has(g.productId));
    const aiEditCount = generations.filter(
      (g) =>
        needsFixIds.has(g.productId) &&
        (
          g.status === 'pending' ||
          g.status === 'running' ||
          isReady(g) ||
          g.status === 'failed' ||
          g.status === 'cancelled'
        ),
    ).length;

    const searchFilter = (r: ThumbnailAnalysisResult) =>
      !sq || r.productName.toLowerCase().includes(sq);

    const cleanResults = classifiedResults.filter((r) => !needsThumbnailFix(r));
    const hasEditStatus = (items: ThumbnailAnalysisResult[], statuses: string[]) =>
      items.filter((r) => {
        const g = genByProductId.get(r.productId);
        return g && statuses.includes(g.status);
      });

    const isAllTabFailFilter = activeTab === 'all' && gradeFilter === 'FAIL';
    const filterBase =
      activeTab === 'needsfix' || isAllTabFailFilter ? needsFixProducts : cleanResults;

    let filtered: ThumbnailAnalysisResult[];
    if (gradeFilter === 'all') filtered = filterBase;
    else if (gradeFilter === 'edit-pending') filtered = hasEditStatus(filterBase, ['pending', 'running']);
    else if (gradeFilter === 'edit-ready')
      filtered = filterBase.filter((item) => {
        const g = genByProductId.get(item.productId);
        return g && isReady(g);
      });
    else if (gradeFilter === 'edit-failed') filtered = hasEditStatus(filterBase, ['failed']);
    else if (gradeFilter === 'FAIL')
      filtered = filterBase.filter((r) => getEffectiveComplianceGrade(r) === 'FAIL');
    else if (['WARN', 'PASS'].includes(gradeFilter))
      filtered = filterBase.filter((r) => getEffectiveComplianceGrade(r) === gradeFilter);
    else if (['S', 'A', 'B', 'C', 'F'].includes(gradeFilter))
      filtered = filterBase.filter((r) => r.grade === gradeFilter);
    else filtered = filterBase;

    if (activeTab === 'needsfix' && !gradeFilter.startsWith('edit-')) {
      filtered = filtered.filter((r) => !genByProductId.has(r.productId));
    }

    filtered = filtered
      .filter(searchFilter)
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });

    const totalPages = Math.ceil(filtered.length / pageSize);
    const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

    const unclassifiedWithImage = unclassified.filter((r) => r.imageUrl).filter(searchFilter);
    const unclassifiedNoImage = [
      ...unclassified.filter((r) => !r.imageUrl),
      ...classifiedNoImage,
    ].filter(searchFilter);

    const activeGenForProduct = selectedProduct
      ? generations.find(
          (g) =>
            g.productId === selectedProduct.productId &&
            (g.status === 'running' || isReady(g)),
        ) ?? null
      : null;

    const totalCount = effectiveScanResult.total;
    const analyzedCount = classifiedResults.length;
    const avgScore =
      analyzedCount > 0
        ? Math.round(classifiedResults.reduce((s, r) => s + r.overallScore, 0) / analyzedCount)
        : 0;
    const gradeDistribution = classifiedResults.reduce<Record<string, number>>(
      (acc, r) => {
        if (r.grade) acc[r.grade] = (acc[r.grade] ?? 0) + 1;
        return acc;
      },
      { S: 0, A: 0, B: 0, C: 0, F: 0 },
    );
    const healthGrade =
      avgScore >= 90 ? 'S' : avgScore >= 75 ? 'A' : avgScore >= 60 ? 'B' : avgScore >= 40 ? 'C' : 'F';
    const needsFixCount = needsFixProducts.filter((p) => !genByProductId.has(p.productId)).length;
    const appliedCount = historyByProduct.length;
    const reviewedCount = appliedCount;

    const historyTotalPages = Math.ceil(historyByProduct.length / pageSize);
    const pagedHistory = historyByProduct.slice(
      (historyPage - 1) * pageSize,
      historyPage * pageSize,
    );

    const unclassifiedSample = unclassified.slice(0, 7);
    const recentClassified = classifiedResults.slice(0, 7);
    const needsFixSample = classifiedResults
      .filter((r) => !genByProductId.has(r.productId) && needsThumbnailFix(r))
      .slice(0, 7);
    const inGeneration = validActiveGenerations.slice(0, 7);
    const recentApplied = generations
      .filter(
        (g) =>
          isApplied(g) &&
          !!pickDisplayableImageUrl(g.selectedUrl, g.originalUrl, g.product?.imageUrl),
      )
      .slice(0, 7);

    const failCount = classifiedResults.filter((r) => getEffectiveComplianceGrade(r) === 'FAIL').length;
    const warnCount = classifiedResults.filter((r) => getEffectiveComplianceGrade(r) === 'WARN').length;
    const passCount = classifiedResults.filter((r) => getEffectiveComplianceGrade(r) === 'PASS').length;

    return {
      allResults,
      unclassified,
      generatedProductIds,
      genByProductId,
      historyByProduct,
      classifiedNoImage,
      unclassifiedCount,
      classifiedResults,
      needsFixProducts,
      pendingProducts,
      validActiveGenerations,
      aiEditCount,
      filtered,
      totalPages,
      paged,
      unclassifiedWithImage,
      unclassifiedNoImage,
      activeGenForProduct,
      totalCount,
      analyzedCount,
      avgScore,
      gradeDistribution,
      healthGrade,
      needsFixCount,
      appliedCount,
      reviewedCount,
      historyTotalPages,
      pagedHistory,
      unclassifiedSample,
      recentClassified,
      needsFixSample,
      inGeneration,
      recentApplied,
      failCount,
      warnCount,
      passCount,
    };
  }, [
    activeTab,
    generations,
    gradeFilter,
    historyPage,
    page,
    pageSize,
    scanResult,
    selectedProduct,
    sq,
  ]);
}
